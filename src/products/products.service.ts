import { Injectable } from '@nestjs/common';
import { TableName } from 'lib/enums';
import { Product, ResponseSurvey } from 'lib/interfaces/entities.interface';
import { SupabaseService } from 'supabase/supabase.service';

@Injectable()
export class ProductsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  public getProductsById(productIds: string[], testId?: string) {
    return this.supabaseService.getById<Product[]>({
      tableName: TableName.PRODUCTS,
      id: productIds,
      selectQuery: `
        *,
        responses_surveys!inner (
          id,
          created_at,
          tester_id,
          value,
          appearance,
          confidence,
          brand,
          convenience,
          likes_most,
          improve_suggestions
        )${testId ? `.eq('test_id', '${testId}')` : ''}
      `,
      single: false,
    });
  }

  public getProductSurveys(productId: string, testId: string) {
    return this.supabaseService.getByCondition<ResponseSurvey[]>({
      tableName: TableName.RESPONSES_SURVEYS,
      condition: 'product_id',
      value: productId,
      single: false,
      additionalConditions: [{ key: 'test_id' as any, value: testId }],
    });
  }
}
