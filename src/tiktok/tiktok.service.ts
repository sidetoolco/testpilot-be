import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ScrapeCreatorsHttpClient } from './scrape-creators-http.client';
import {
  TikTokSearchResponse,
  TikTokProductDetailResponse,
} from './interfaces/tiktok-response.interface';
import { formatTikTokResult } from './formatters/tiktok-result.formatter';
import { TikTokProduct } from './dto/tiktok-product.dto';
import { SupabaseService } from 'supabase/supabase.service';
import { TableName } from 'lib/enums';

@Injectable()
export class TikTokService {
  private readonly logger = new Logger(TikTokService.name);

  constructor(
    private readonly scrapeCreatorsClient: ScrapeCreatorsHttpClient,
    private readonly supabaseService: SupabaseService,
  ) {}

  public async queryTikTokProducts(searchTerm: string, region = 'US', page = '1') {
    const response = await this.scrapeCreatorsClient.get<TikTokSearchResponse>(
      '/v1/tiktok/shop/search',
      { params: { query: searchTerm, region, page } },
    );
    return formatTikTokResult(response.products || [], searchTerm);
  }

  public async getTikTokProductDetail(productIdOrUrl: string, region = 'US') {
    const url = productIdOrUrl.startsWith('http')
      ? productIdOrUrl
      : `https://www.tiktok.com/view/product/${productIdOrUrl}`;

    return this.scrapeCreatorsClient.get<TikTokProductDetailResponse>(
      '/v1/tiktok/product',
      { params: { url, region } },
    );
  }

  public async getSavedProduct(id: string) {
    return this.supabaseService.findOne<TikTokProduct>(
      TableName.TIKTOK_PRODUCTS,
      { id },
    );
  }

  public async getSavedProductByTikTokId(tiktokId: string, companyId?: string) {
    const query: any = { tiktok_id: tiktokId };
    if (companyId) query.company_id = companyId;
    return this.supabaseService.findOne<TikTokProduct>(
      TableName.TIKTOK_PRODUCTS,
      query,
    );
  }

  public async saveTikTokProducts(
    products: TikTokProduct[],
    testId: string,
    companyId: string,
  ) {
    try {
      const tiktokIds = products.map((p) => (p as any).tiktok_id);
      const existing = await this.supabaseService.findMany<any>(
        TableName.TIKTOK_PRODUCTS,
        { tiktok_id: tiktokIds, company_id: companyId },
      );
      const existingMap = new Map(existing.map((p: any) => [p.tiktok_id, p]));

      const savedProducts: any[] = [];
      const toInsert: any[] = [];

      for (const p of products) {
        const tiktokId = (p as any).tiktok_id;
        if (existingMap.has(tiktokId)) {
          savedProducts.push(existingMap.get(tiktokId));
        } else {
          const { id: _id, ...rest } = p as any;
          toInsert.push({ id: randomUUID(), ...rest, company_id: companyId });
        }
      }

      if (toInsert.length > 0) {
        const valid = toInsert.filter((p) => p.tiktok_id && `${p.tiktok_id}`.trim());
        if (valid.length > 0) {
          const newRows = await this.supabaseService.upsertMany<any>(
            TableName.TIKTOK_PRODUCTS,
            valid,
            'tiktok_id,company_id',
          );
          savedProducts.push(...newRows);
        }
      }

      const competitorResult = await this.saveProductsInCompetitorTable(
        testId,
        savedProducts,
      );

      this.logger.log(
        `Saved ${savedProducts.length} TikTok products; ${competitorResult.length} competitors linked.`,
      );

      return {
        competitors: competitorResult,
        variations: [],
        totalProducts: savedProducts.length,
        message: 'TikTok competitors saved.',
      };
    } catch (error) {
      this.logger.error('Error in saveTikTokProducts:', error);
      throw error;
    }
  }

  public async saveTikTokProductPreview(
    products: TikTokProduct[],
    companyId: string,
  ) {
    const tiktokIds = products.map((p) => (p as any).tiktok_id);
    const existing = await this.supabaseService.findMany<any>(
      TableName.TIKTOK_PRODUCTS,
      { tiktok_id: tiktokIds, company_id: companyId },
    );
    const existingMap = new Map(existing.map((p: any) => [p.tiktok_id, p]));

    const savedProducts: any[] = [];
    const toInsert: any[] = [];

    for (const p of products) {
      const tiktokId = (p as any).tiktok_id;
      if (existingMap.has(tiktokId)) {
        savedProducts.push(existingMap.get(tiktokId));
      } else {
        const { id: _id, ...rest } = p as any;
        toInsert.push({ id: randomUUID(), ...rest, company_id: companyId });
      }
    }

    if (toInsert.length > 0) {
      const valid = toInsert.filter((p) => p.tiktok_id && `${p.tiktok_id}`.trim());
      if (valid.length > 0) {
        const newRows = await this.supabaseService.upsertMany<any>(
          TableName.TIKTOK_PRODUCTS,
          valid,
          'tiktok_id,company_id',
        );
        savedProducts.push(...newRows);
      }
    }

    return savedProducts;
  }

  private async saveProductsInCompetitorTable(
    testId: string,
    competitors: Array<any & { id: string }>,
  ) {
    const dto = competitors.map((c) => ({
      test_id: testId,
      product_id: c.id,
      product_type: 'tiktok_product',
    }));
    return this.supabaseService.insert(TableName.TEST_COMPETITORS, dto);
  }
}
