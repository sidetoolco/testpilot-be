import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from 'supabase/supabase.service';
import { CreditsData, Transaction } from './interfaces';
import { Rpc } from 'lib/enums';

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
      const [balance, result] = await Promise.all([
        this.supabaseService.rpc<number>(Rpc.GET_COMPANY_BALANCE, {
          p_company_id: companyId,
        }),
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
      const total = result?.count ?? 0;
      const totalPages = Math.ceil(total / limit);

      return {
        balance: balance || 0,
        transactions: {
          data: transactions,
          total,
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
}
