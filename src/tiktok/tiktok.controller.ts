import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { CurrentUser } from 'auth/decorators';
import { UsersService } from 'users/users.service';
import { TikTokService } from './tiktok.service';
import { SaveTikTokProductsDto } from './dto/tiktok-product.dto';

@UseGuards(JwtAuthGuard)
@Controller('tiktok')
export class TikTokController {
  private readonly logger = new Logger(TikTokController.name);

  constructor(
    private readonly tiktokService: TikTokService,
    private readonly usersService: UsersService,
  ) {}

  @UseInterceptors(CacheInterceptor)
  @Get('products')
  async getTikTokProducts(
    @Query('term') searchTerm: string,
    @Query('region') region = 'US',
    @Query('page') page = '1',
  ) {
    if (!searchTerm) {
      throw new BadRequestException('Missing term parameter');
    }
    return this.tiktokService.queryTikTokProducts(searchTerm, region, page);
  }

  @Get('products/saved/:id')
  async getSavedProduct(@Param('id') id: string) {
    if (!id) throw new BadRequestException('Missing product ID');
    return this.tiktokService.getSavedProduct(id);
  }

  @UseInterceptors(CacheInterceptor)
  @Get('products/tiktok/:productId')
  async getTikTokProductDetail(
    @Param('productId') productId: string,
    @Query('region') region = 'US',
    @CurrentUser('id') userId?: any,
  ) {
    if (!productId) throw new BadRequestException('Missing productId parameter');

    try {
      const userCompanyId = userId
        ? await this.usersService.getUserCompanyId(userId)
        : undefined;
      const saved = await this.tiktokService.getSavedProductByTikTokId(
        productId,
        userCompanyId,
      );
      if (saved) return saved;
    } catch {
      this.logger.debug(`Product ${productId} not in DB, fetching from API.`);
    }

    try {
      return await this.tiktokService.getTikTokProductDetail(productId, region);
    } catch (error) {
      throw new BadRequestException(`Failed to fetch product: ${error.message}`);
    }
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    if (!id) throw new BadRequestException('Missing product ID');
    try {
      const saved = await this.tiktokService.getSavedProduct(id);
      if (saved) return saved;
    } catch {
      this.logger.debug(`Product ${id} not found in saved products.`);
    }
    throw new BadRequestException(`Product not found: ${id}`);
  }

  @Post('products/:testId?')
  async saveTikTokProducts(
    @Body() { products }: SaveTikTokProductsDto,
    @Param('testId') testId?: string,
    @CurrentUser('id') userId?: any,
  ) {
    try {
      this.logger.debug('TikTok products save request', {
        testId,
        userId,
        productsCount: products?.length,
      });

      const userCompanyId = await this.usersService.getUserCompanyId(userId);
      if (!userCompanyId) {
        throw new BadRequestException('Missing company ID');
      }

      const skipped: Array<{ index: number; reason: string; tiktok_id?: string }> = [];
      const normalized = (products || []).map((p, index) => {
        const tiktok_id = (p as any).tiktok_id ?? (p as any).id ?? null;
        const rating = (p as any).rating ?? null;
        const reviews_count = (p as any).reviews_count ?? null;
        const search_term_raw = (p as any).search_term;
        const search_term = typeof search_term_raw === 'string' ? search_term_raw : null;

        return {
          ...p,
          id: undefined,
          tiktok_id,
          rating,
          reviews_count,
          search_term,
        } as any;
      });

      const validProducts = normalized.filter((p, index) => {
        if (!p?.tiktok_id || `${p.tiktok_id}`.trim() === '') {
          skipped.push({ index, reason: 'missing tiktok_id', tiktok_id: p?.tiktok_id ?? null });
          return false;
        }
        return true;
      });

      if (skipped.length > 0) {
        this.logger.debug('Skipped TikTok products', { count: skipped.length });
      }

      if (testId) {
        return await this.tiktokService.saveTikTokProducts(
          validProducts,
          testId,
          userCompanyId,
        );
      }

      return await this.tiktokService.saveTikTokProductPreview(
        validProducts,
        userCompanyId,
      );
    } catch (error) {
      this.logger.error('TikTok products save error', {
        errorType: error.constructor?.name,
        errorMessage: error.message,
        testId,
        userId,
        productsCount: products?.length,
      });
      throw new BadRequestException(`Failed to save TikTok products: ${error.message}`);
    }
  }
}
