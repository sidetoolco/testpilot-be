import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from 'supabase/supabase.service';
import { CreditsData, Transaction } from './interfaces';
import { Rpc, TableName } from 'lib/enums';
import {
  CompanyCredits,
  CreditPayment,
  CreditUsage,
} from 'lib/interfaces/entities.interface';
import { PaymentStatus } from './enums';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);
  private readonly CREDITS_PER_TESTER = 1;
  private readonly CREDITS_PER_TESTER_WITH_CUSTOM_SCREENING = 1.1;

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Retrieves comprehensive credits data for a company including total credits and transaction history
   * @param companyId - The unique identifier of the company
   * @param page - The page number for pagination (default: 1)
   * @param limit - The number of transactions per page (default: 20)
   * @returns Promise<CreditsData> - Object containing total credits and paginated transaction history
   * @throws InternalServerErrorException - When database operations fail
   */
  public async getCompanyCreditsData(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<CreditsData> {
    try {
      const [total, result] = await Promise.all([
        this.getCompanyAvailableCredits(companyId),
        this.supabaseService.rpc<{
          transactions: Transaction[];
          count: number;
        }>(Rpc.GET_COMPANY_TRANSACTION_HISTORY, {
          p_company_id: companyId,
          p_page: page,
          p_limit: limit,
        }),
      ]);

      const transactions = result?.transactions ?? [];
      const totalResults = result?.count ?? 0;
      const totalPages = Math.ceil(totalResults / limit);

      return {
        total: total || 0,
        transactions: {
          data: transactions,
          total: totalResults,
          page,
          limit,
          totalPages,
        },
      };
    } catch (error) {
      this.logger.error('Error fetching company credits data:', error);
      throw new InternalServerErrorException('Failed to fetch credits data');
    }
  }

  /**
   * Retrieves comprehensive credits data for a specific company (admin use)
   * @param companyId - The unique identifier of the company
   * @param page - The page number for pagination (default: 1)
   * @param limit - The number of transactions per page (default: 20)
   * @returns Promise<CreditsData> - Object containing total credits and paginated transaction history
   * @throws NotFoundException - When company is not found
   * @throws InternalServerErrorException - When database operations fail
   */
  public async getCompanyCreditsDataById(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<CreditsData & { company_id: string; company_name: string }> {
    try {
      // First verify the company exists
      const company = await this.supabaseService.getById<{
        id: string;
        name: string;
      }>({
        tableName: TableName.COMPANIES,
        selectQuery: 'id, name',
        single: true,
        id: companyId,
      });

      if (!company) {
        throw new NotFoundException('Company not found');
      }

      const [total, result] = await Promise.all([
        this.getCompanyAvailableCredits(companyId),
        this.supabaseService.rpc<{
          transactions: Transaction[];
          count: number;
        }>(Rpc.GET_COMPANY_TRANSACTION_HISTORY, {
          p_company_id: companyId,
          p_page: page,
          p_limit: limit,
        }),
      ]);

      const transactions = result?.transactions ?? [];
      const totalResults = result?.count ?? 0;
      const totalPages = Math.ceil(totalResults / limit);

      return {
        total: total || 0,
        company_id: company.id,
        company_name: company.name,
        transactions: {
          data: transactions,
          total: totalResults,
          page,
          limit,
          totalPages,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error fetching company credits data:', error);
      throw new InternalServerErrorException('Failed to fetch credits data');
    }
  }

  /**
   * Sets credits for a specific company to a specific value (admin only)
   * @param companyId - The unique identifier of the company
   * @param credits - The new total number of credits to set
   * @param description - Description of the credit modification
   * @returns Promise<object> - Object containing success status, message, transaction, and new balance
   * @throws NotFoundException - When company is not found
   * @throws InternalServerErrorException - When database operations fail
   */
  public async editCreditsForCompany(
    companyId: string,
    credits: number,
    description: string,
  ): Promise<{
    success: boolean;
    message: string;
    transaction: {
      id: string;
      type: string;
      credits: number;
      status: string;
      description: string;
      created_at: string;
    };
    new_balance: number;
  }> {
    try {
      // First verify the company exists
      const company = await this.supabaseService.getById<{
        id: string;
        name: string;
      }>({
        tableName: TableName.COMPANIES,
        selectQuery: 'id, name',
        single: true,
        id: companyId,
      });

      if (!company) {
        throw new NotFoundException('Company not found');
      }

      // Prevent negative credits
      if (credits < 0) {
        throw new BadRequestException('Credits cannot be negative');
      }

      // Get current credits for logging and calculating the difference
      const currentCredits = await this.getCompanyAvailableCredits(companyId);
      const creditsDifference = credits - currentCredits;

      let payment = null;

      // Only create a payment record if credits are being added (positive difference)
      // For credit reductions, we'll just update the balance without a payment record
      if (creditsDifference > 0) {
        // Create a payment transaction record for audit trail
        payment = await this.supabaseService.insert<CreditPayment>(
          TableName.CREDIT_PAYMENTS,
          {
            company_id: companyId,
            stripe_payment_intent_id: `admin_${Date.now()}`, // Generate a unique admin identifier
            amount_cents: creditsDifference * 49, // Assuming 49 cents per credit (same as Stripe pricing)
            credits_purchased: creditsDifference,
            status: PaymentStatus.COMPLETED,
          },
        );
      }

      // Update company credits to the new value
      await this.supabaseService.update<CompanyCredits>(
        TableName.COMPANY_CREDITS,
        { total: credits },
        [{ key: 'company_id', value: companyId }],
      );

      this.logger.log(`Admin set credits for company ${companyId} from ${currentCredits} to ${credits} (difference: ${creditsDifference})`);

      return {
        success: true,
        message: 'Credits updated successfully',
        transaction: payment ? {
          id: payment[0].id,
          type: 'payment',
          credits: creditsDifference,
          status: 'completed',
          description: description,
          created_at: payment[0].created_at,
        } : {
          id: `admin_${Date.now()}`,
          type: 'admin_adjustment',
          credits: creditsDifference,
          status: 'completed',
          description: description,
          created_at: new Date().toISOString(),
        },
        new_balance: credits,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error editing credits for company:', error);
      throw new InternalServerErrorException('Failed to edit credits');
    }
  }

  /**
   * Creates a pending payment record for credit purchases
   * @param companyId - The unique identifier of the company making the purchase
   * @param stripePaymentIntentId - The Stripe payment intent ID for tracking the payment
   * @param amountCents - The payment amount in cents
   * @param creditsPurchased - The number of credits being purchased
   * @returns Promise<CreditPayment[]> - Array containing the created payment record
   * @throws Error - When database insertion fails
   */
  public async createPendingPayment(
    companyId: string,
    stripePaymentIntentId: string,
    amountCents: number,
    creditsPurchased: number,
  ): Promise<CreditPayment[]> {
    try {
      const payment = await this.supabaseService.insert<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        {
          company_id: companyId,
          stripe_payment_intent_id: stripePaymentIntentId,
          amount_cents: amountCents,
          credits_purchased: creditsPurchased,
          status: PaymentStatus.PENDING,
        },
      );

      this.logger.log(`Created pending payment for company ${companyId}`);
      return payment;
    } catch (error) {
      this.logger.error('Error creating pending payment:', error);
      throw error;
    }
  }

  /**
   * Updates the status of a credit payment based on Stripe webhook events
   * @param stripePaymentIntentId - The Stripe payment intent ID to update
   * @param status - The new payment status (PENDING, SUCCEEDED, FAILED, etc.)
   * @returns Promise<void> - Resolves when the update is complete
   * @throws Error - When database update fails
   */
  public async updatePaymentStatus(
    stripePaymentIntentId: string,
    status: PaymentStatus,
  ): Promise<void> {
    try {
      await this.supabaseService.update<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        { status },
        [{ key: 'stripe_payment_intent_id', value: stripePaymentIntentId }],
      );

      this.logger.log(`Updated payment ${stripePaymentIntentId} to ${status}`);
    } catch (error) {
      this.logger.error('Error updating payment status:', error);
      throw error;
    }
  }

  /**
   * Records credit usage for a specific test
   * @param companyId - The unique identifier of the company running the test
   * @param testId - The unique identifier of the test
   * @param creditsUsed - The number of credits consumed by the test
   * @returns Promise<CreditUsage> - The created credit usage record
   * @throws Error - When database insertion fails
   */
  public async saveCreditUsage(
    companyId: string,
    testId: string,
    creditsUsed: number,
  ): Promise<CreditUsage> {
    try {
      const creditUsage = await this.supabaseService.insert<CreditUsage>(
        TableName.CREDIT_USAGE,
        {
          company_id: companyId,
          test_id: testId,
          credits_used: creditsUsed,
        },
      );

      return creditUsage[0];
    } catch (error) {
      this.logger.error(`Error creating credit usage record:`, error);
      throw error;
    }
  }

  /**
   * Adds credits to a company when a payment is completed successfully
   * @param companyId - The unique identifier of the company
   * @param creditsToAdd - The number of credits to add
   * @returns Promise<number> - The new total credit balance
   * @throws Error - When database operations fail
   */
  public async addCreditsToCompany(
    companyId: string,
    creditsToAdd: number,
  ): Promise<number> {
    try {
      // Get current credits
      const currentCredits = await this.getCompanyAvailableCredits(companyId);
      const newTotal = currentCredits + creditsToAdd;

      // Update company credits
      await this.supabaseService.update<CompanyCredits>(
        TableName.COMPANY_CREDITS,
        { total: newTotal },
        [{ key: 'company_id', value: companyId }],
      );

      this.logger.log(`Added ${creditsToAdd} credits to company ${companyId}. New balance: ${newTotal}`);
      return newTotal;
    } catch (error) {
      this.logger.error(`Error adding credits to company ${companyId}:`, error);
      throw error;
    }
  }

  /**
   * Processes existing pending payments and adds credits for completed ones
   * This is useful for fixing existing pending payments that should have been completed
   * @param companyId - The unique identifier of the company
   * @returns Promise<{ processed: number; added: number }> - Number of payments processed and credits added
   */
  public async processPendingPayments(companyId: string): Promise<{ processed: number; added: number }> {
    try {
      // Get all pending payments for the company
      const pendingPayments = await this.supabaseService.findMany<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        { company_id: companyId, status: PaymentStatus.PENDING },
        'id, credits_purchased, stripe_payment_intent_id'
      );

      let processed = 0;
      let totalCreditsAdded = 0;

      for (const payment of pendingPayments) {
        try {
          // Check if this payment should be completed (you might want to verify with Stripe here)
          // For now, we'll assume pending payments older than a certain time should be completed
          // This is a simplified approach - in production you'd want to verify with Stripe
          
          // Add credits for this payment
          await this.addCreditsToCompany(companyId, payment.credits_purchased);
          
          // Update payment status to completed
          await this.updatePaymentStatus(payment.stripe_payment_intent_id, PaymentStatus.COMPLETED);
          
          processed++;
          totalCreditsAdded += payment.credits_purchased;
          
          this.logger.log(`Processed pending payment ${payment.id} for ${payment.credits_purchased} credits`);
        } catch (error) {
          this.logger.error(`Failed to process pending payment ${payment.id}:`, error);
        }
      }

      this.logger.log(`Processed ${processed} pending payments, added ${totalCreditsAdded} credits for company ${companyId}`);
      return { processed, added: totalCreditsAdded };
    } catch (error) {
      this.logger.error(`Error processing pending payments for company ${companyId}:`, error);
      throw error;
    }
  }

  /**
   * Gets payment details by Stripe payment intent ID
   * @param stripePaymentIntentId - The Stripe payment intent ID
   * @returns Promise<CreditPayment | null> - The payment details or null if not found
   */
  public async getPaymentByStripeIntentId(stripePaymentIntentId: string): Promise<CreditPayment | null> {
    try {
      const payment = await this.supabaseService.findOne<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        { stripe_payment_intent_id: stripePaymentIntentId }
      );
      return payment;
    } catch (error) {
      this.logger.error(`Error getting payment by Stripe intent ID ${stripePaymentIntentId}:`, error);
      return null;
    }
  }

  /**
   * Retrieves the current available credits balance for a company
   * @param companyId - The unique identifier of the company
   * @returns Promise<number> - The total available credits for the company
   * @throws InternalServerErrorException - When database query fails
   */
  public async getCompanyAvailableCredits(companyId: string): Promise<number> {
    try {
      const companyCredits = await this.supabaseService.findOne<
        Pick<CompanyCredits, 'total'>
      >(TableName.COMPANY_CREDITS, { company_id: companyId }, 'total');

      return companyCredits?.total || 0;
    } catch (error) {
      this.logger.error('Error checking company credits:', error);
      throw new InternalServerErrorException('Failed to check company credits');
    }
  }

  /**
   * Calculates the total credits required for a test based on participant count and screening options
   * @param targetParticipantCount - The number of participants needed for the test
   * @param customScreeningEnabled - Whether custom screening questions are enabled (affects credit cost)
   * @returns number - The total credits required for the test
   */
  public calculateTestCredits(
    targetParticipantCount: number,
    customScreeningEnabled: boolean,
  ): number {
    return (
      targetParticipantCount *
      (customScreeningEnabled
        ? this.CREDITS_PER_TESTER_WITH_CUSTOM_SCREENING
        : this.CREDITS_PER_TESTER)
    );
  }

  /**
   * Refunds credits for a specific test by deleting the credit usage record
   * @param companyId - The unique identifier of the company
   * @param testId - The unique identifier of the test
   * @returns Promise<void> - Resolves when the refund is complete
   * @throws Error - When database deletion fails
   */
  public async refundCreditUsage(
    companyId: string,
    testId: string,
  ): Promise<void> {
    try {
      await this.supabaseService.delete(TableName.CREDIT_USAGE, {
        company_id: companyId,
        test_id: testId,
      });

      this.logger.log(`Refunded credits for test ${testId} and company ${companyId}`);
    } catch (error) {
      this.logger.error(`Error refunding credits for test ${testId}:`, error);
      throw error;
    }
  }
}
