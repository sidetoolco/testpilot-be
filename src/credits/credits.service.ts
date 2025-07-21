import {
  Injectable,
  InternalServerErrorException,
  Logger,
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
