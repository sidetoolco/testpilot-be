import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from 'supabase/supabase.service';
import { CreditsData, Transaction } from './interfaces';
import { Rpc, TableName } from 'lib/enums';
import { CompanyCredits, CreditPayment } from 'lib/interfaces/entities.interface';
import { PaymentStatus } from './enums';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);
  constructor(private readonly supabaseService: SupabaseService) {}

  public async getCompanyCreditsData(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<CreditsData> {
    try {
      const [{ total }, result] = await Promise.all([
        this.supabaseService.findOne<Pick<CompanyCredits, 'total'>>(
          TableName.COMPANY_CREDITS,
          {
            company_id: companyId,
          },
          'total',
        ),
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
}
