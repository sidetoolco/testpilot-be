import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from 'supabase/supabase.service';
import { CreditsData, Transaction } from './interfaces';
import { Rpc, TableName } from 'lib/enums';

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
      const [total, result] = await Promise.all([
        this.supabaseService.findOne<number>(
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
}
