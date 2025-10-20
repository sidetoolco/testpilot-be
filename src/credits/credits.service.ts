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
      this.logger.log(`Getting credits data for company: ${companyId}, page: ${page}, limit: ${limit}`);
      
      const [total, transactions, totalCount] = await Promise.all([
        this.getCompanyAvailableCredits(companyId),
        this.getCompanyTransactions(companyId, page, limit),
        this.getCompanyTransactionsCount(companyId),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      this.logger.log(`Found ${totalCount} total transactions, returning ${transactions.length} for page ${page}`);

      return {
        total: total || 0,
        transactions: {
          data: transactions,
          total: totalCount,
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
   * Gets company transactions directly from credit_payments table
   * @param companyId - The company ID
   * @param page - Page number
   * @param limit - Items per page
   * @returns Promise<Transaction[]> - Array of transactions
   */
  private async getCompanyTransactions(
    companyId: string,
    page: number,
    limit: number,
  ): Promise<Transaction[]> {
    try {
      const offset = (page - 1) * limit;
      
      const payments = await this.supabaseService.findMany<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        { company_id: companyId },
        'id, credits_purchased, amount_cents, status, stripe_payment_intent_id, created_at, updated_at'
      );

      // Sort by created_at descending (newest first)
      const sortedPayments = payments.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Apply pagination
      const paginatedPayments = sortedPayments.slice(offset, offset + limit);

      // Map credit_payments to Transaction interface
      const transactions: Transaction[] = paginatedPayments.map(payment => ({
        id: payment.id,
        type: 'payment' as const,
        amount_cents: payment.amount_cents,
        credits: payment.credits_purchased,
        status: payment.status,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
      }));

      this.logger.log(`Retrieved ${transactions.length} transactions for company ${companyId} (page ${page}, limit ${limit})`);
      return transactions;
    } catch (error) {
      this.logger.error(`Error getting company transactions for ${companyId}:`, error);
      return [];
    }
  }

  /**
   * Gets total count of company transactions
   * @param companyId - The company ID
   * @returns Promise<number> - Total transaction count
   */
  private async getCompanyTransactionsCount(companyId: string): Promise<number> {
    try {
      const payments = await this.supabaseService.findMany<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        { company_id: companyId },
        'id'
      );
      
      const count = payments.length;
      this.logger.log(`Total transactions count for company ${companyId}: ${count}`);
      return count;
    } catch (error) {
      this.logger.error(`Error getting transaction count for company ${companyId}:`, error);
      return 0;
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

      const [total, transactions, totalCount] = await Promise.all([
        this.getCompanyAvailableCredits(companyId),
        this.getCompanyTransactions(companyId, page, limit),
        this.getCompanyTransactionsCount(companyId),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        total: total || 0,
        company_id: company.id,
        company_name: company.name,
        transactions: {
          data: transactions,
          total: totalCount,
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
   * Updates payment status only if it matches the expected current status (idempotent)
   * @param stripePaymentIntentId - The Stripe payment intent ID
   * @param fromStatus - The expected current status
   * @param toStatus - The new status to set
   * @returns Promise<boolean> - True if status was updated, false if already changed
   */
  public async updatePaymentStatusIf(
    stripePaymentIntentId: string,
    fromStatus: PaymentStatus,
    toStatus: PaymentStatus,
  ): Promise<boolean> {
    try {
      // First check current status
      const currentPayment = await this.supabaseService.findOne<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        { stripe_payment_intent_id: stripePaymentIntentId },
        'id, status'
      );

      if (!currentPayment) {
        this.logger.warn(`Payment not found for Stripe intent ID: ${stripePaymentIntentId}`);
        return false;
      }

      if (currentPayment.status !== fromStatus) {
        this.logger.log(
          `Payment ${stripePaymentIntentId} status is ${currentPayment.status}, expected ${fromStatus}, skipping update`
        );
        return false;
      }

      // Update status atomically
      const result = await this.supabaseService.update<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        { status: toStatus },
        [{ key: 'stripe_payment_intent_id', value: stripePaymentIntentId }],
      );

      const success = result !== null;
      if (success) {
        this.logger.log(`Successfully updated payment ${stripePaymentIntentId} from ${fromStatus} to ${toStatus}`);
      }

      return success;
    } catch (error) {
      this.logger.error(`Error updating payment status for ${stripePaymentIntentId}:`, error);
      return false;
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

      // Check if company_credits record exists, if not create it, otherwise update it
      const existingCredits = await this.supabaseService.findMany<CompanyCredits>(
        TableName.COMPANY_CREDITS,
        { company_id: companyId },
        'id, total'
      );

      if (existingCredits && existingCredits.length > 0) {
        // Update existing record
        await this.supabaseService.update<CompanyCredits>(
          TableName.COMPANY_CREDITS,
          { total: newTotal },
          [{ key: 'company_id', value: companyId }],
        );
      } else {
        // Create new record
        await this.supabaseService.insert<CompanyCredits>(
          TableName.COMPANY_CREDITS,
          {
            company_id: companyId,
            total: newTotal,
          }
        );
      }

      this.logger.log(`Added ${creditsToAdd} credits to company ${companyId}. New balance: ${newTotal}`);
      return newTotal;
    } catch (error) {
      this.logger.error(`Error adding credits to company ${companyId}:`, error);
      throw error;
    }
  }

  /**
   * Processes existing pending payments and adds credits for completed ones
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
          // Simple check: only process if still pending
          const currentPayment = await this.supabaseService.findOne<CreditPayment>(
            TableName.CREDIT_PAYMENTS,
            { stripe_payment_intent_id: payment.stripe_payment_intent_id },
            'status'
          );

          if (currentPayment?.status !== PaymentStatus.PENDING) {
            continue; // Already processed, skip
          }

          // Add credits and update status
          await this.addCreditsToCompany(companyId, payment.credits_purchased);
          await this.updatePaymentStatus(payment.stripe_payment_intent_id, PaymentStatus.COMPLETED);

          processed++;
          totalCreditsAdded += payment.credits_purchased;
        } catch (error) {
          this.logger.error(`Failed to process payment ${payment.id}:`, error);
        }
      }

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
      // Get credits directly from COMPANY_CREDITS table (source of truth)
      const companyCredits = await this.supabaseService.findMany<CompanyCredits>(
        TableName.COMPANY_CREDITS,
        { company_id: companyId },
        'id, total, created_at, updated_at'
      );

      if (companyCredits && companyCredits.length > 0) {
        return companyCredits[0].total || 0;
      }

      // Fallback: Calculate from payments minus usage if no COMPANY_CREDITS record exists
      const completedPayments = await this.supabaseService.findMany<CreditPayment>(
        TableName.CREDIT_PAYMENTS,
        { company_id: companyId, status: PaymentStatus.COMPLETED },
        'credits_purchased'
      );

      const totalPurchased = completedPayments.reduce((sum, payment) => sum + payment.credits_purchased, 0);

      // Get credit usage
      let totalUsed = 0;
      try {
        const creditUsage = await this.supabaseService.findMany<CreditUsage>(
          TableName.CREDIT_USAGE,
          { company_id: companyId },
          'credits_used'
        );
        totalUsed = creditUsage.reduce((sum, usage) => sum + usage.credits_used, 0);
      } catch (error) {
        // Credit usage table might not exist, ignore
      }

      return totalPurchased - totalUsed;
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
   * NOTE: The database trigger will automatically add credits back to company_credits.total
   * when the credit_usage record is deleted
   * @param companyId - The unique identifier of the company
   * @param testId - The unique identifier of the test
   * @returns Promise<void> - Resolves when the refund is complete
   * @throws Error - When database operations fail
   */
  public async refundCreditUsage(
    companyId: string,
    testId: string,
  ): Promise<void> {
    try {
      // Get the credit usage records to know how much will be refunded
      const creditUsageRecords = await this.supabaseService.findMany<CreditUsage>(
        TableName.CREDIT_USAGE,
        { company_id: companyId, test_id: testId },
        'credits_used'
      );

      if (!creditUsageRecords || creditUsageRecords.length === 0) {
        this.logger.warn(`No credit usage found for test ${testId} and company ${companyId}, nothing to refund`);
        return;
      }

      // Calculate total credits that will be refunded
      const creditsToRefund = creditUsageRecords.reduce((sum, record) => sum + record.credits_used, 0);
      const currentCredits = await this.getCompanyAvailableCredits(companyId);

      // Delete the credit usage records
      // NOTE: The database trigger will automatically add credits back to company_credits.total
      await this.supabaseService.delete(TableName.CREDIT_USAGE, {
        company_id: companyId,
        test_id: testId,
      });

      // Get the actual balance after the trigger has run
      const newBalance = await this.getCompanyAvailableCredits(companyId);

      this.logger.log(`Refunded ${creditsToRefund} credits for test ${testId} and company ${companyId}. Balance changed from ${currentCredits} to ${newBalance}`);
    } catch (error) {
      this.logger.error(`Error refunding credits for test ${testId}:`, error);
      throw error;
    }
  }

  /**
   * Deducts credits from a company's account for user-initiated actions
   * @param companyId - The unique identifier of the company
   * @param credits - The number of credits to deduct
   * @param description - Description of the credit deduction
   * @returns Promise<{ success: boolean; message: string; remaining_credits: number }>
   * @throws BadRequestException - When insufficient credits or invalid request
   * @throws InternalServerErrorException - When database operations fail
   */
  public async deductCredits(
    companyId: string,
    credits: number,
    description: string,
    testId?: string,
  ): Promise<{ success: boolean; message: string; remaining_credits: number }> {
    try {
      // Application-level idempotency check (fallback if DB constraint not added yet)
      // NOTE: Best practice is to add unique constraint on (company_id, test_id) for true atomicity
      if (testId) {
        const existingUsage = await this.supabaseService.findMany<CreditUsage>(
          TableName.CREDIT_USAGE,
          { company_id: companyId, test_id: testId },
          'id, credits_used'
        );
        
        if (existingUsage && existingUsage.length > 0) {
          this.logger.warn(`Credits already deducted for test ${testId} (app-level check)`);
          const currentCredits = await this.getCompanyAvailableCredits(companyId);
          return {
            success: true,
            message: 'Credits were already deducted for this test',
            remaining_credits: currentCredits,
          };
        }
      }

      // Get current available credits
      const currentCredits = await this.getCompanyAvailableCredits(companyId);
      
      // Check if company has sufficient credits
      if (currentCredits < credits) {
        throw new BadRequestException(
          `Insufficient credits. Available: ${currentCredits}, Required: ${credits}`
        );
      }

      // Create a credit usage record to track the deduction
      // NOTE: The database trigger will automatically deduct from company_credits.total
      try {
        const creditUsage = await this.supabaseService.insert<CreditUsage>(
          TableName.CREDIT_USAGE,
          {
            company_id: companyId,
            credits_used: credits,
            test_id: testId || null,
            created_at: new Date().toISOString(),
          }
        );

        if (!creditUsage || creditUsage.length === 0) {
          throw new InternalServerErrorException('Failed to record credit deduction');
        }
      } catch (error) {
        // If unique constraint exists and is violated, handle gracefully
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
          this.logger.warn(`Credits already deducted for test ${testId} (DB constraint)`);
          const currentCredits = await this.getCompanyAvailableCredits(companyId);
          return {
            success: true,
            message: 'Credits were already deducted for this test',
            remaining_credits: currentCredits,
          };
        }
        throw error;
      }

      // Get the actual balance after the trigger has run
      const actualBalance = await this.getCompanyAvailableCredits(companyId);

      this.logger.log(`Deducted ${credits} credits for company ${companyId}${testId ? ` (test: ${testId})` : ''}. New balance: ${actualBalance}`);

      return {
        success: true,
        message: 'Credits deducted successfully',
        remaining_credits: actualBalance,
      };

    } catch (error) {
      this.logger.error('Failed to deduct credits', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to deduct credits', { cause: error as Error });
    }
  }
}
