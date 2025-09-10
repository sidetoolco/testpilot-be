import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { WalmartService } from './walmart.service';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { SaveWalmartProductsDto } from './dto/walmart-product.dto';
import { CurrentUser } from 'auth/decorators';
import { UsersService } from 'users/users.service';

@UseGuards(JwtAuthGuard)
@Controller('walmart')
export class WalmartController {
  private readonly logger = new Logger(WalmartController.name);

  constructor(
    private readonly walmartService: WalmartService,
    private readonly usersService: UsersService,
  ) {}

  @UseInterceptors(CacheInterceptor)
  @Get('products')
  async getWalmartProducts(@Query('term') searchTerm: string) {
    if (!searchTerm) {
      throw new BadRequestException('Missing searchTerm parameter');
    }

    return this.walmartService.queryWalmartProducts(searchTerm);
  }

  @UseInterceptors(CacheInterceptor)
  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Missing product ID');
    }

    // Try to get saved product first, then Walmart product details
    try {
      const savedProduct = await this.walmartService.getSavedProduct(id);
      if (savedProduct) {
        return savedProduct;
      }
    } catch (error) {
      this.logger.debug(`Product ${id} not found in saved products, trying Walmart API...`);
    }

    // If not found in saved products, try to get from Walmart API
    try {
      return await this.walmartService.getWalmartProductDetail(id);
    } catch (error) {
      throw new BadRequestException(`Product not found: ${id}`);
    }
  }

  @Get('products/walmart/:productId')
  async getWalmartProductDetail(
    @Param('productId') productId: string,
    @CurrentUser('id') userId?: any,
  ) {
    if (!productId) {
      throw new BadRequestException('Missing productId parameter');
    }

    // First try to get from database (fast)
    try {
      const userCompanyId = userId ? await this.usersService.getUserCompanyId(userId) : undefined;
      const savedProduct = await this.walmartService.getSavedProductByWalmartId(productId, userCompanyId);
      if (savedProduct) {
        this.logger.debug(`Product ${productId} found in database, returning cached data`);
        return savedProduct; // Return cached data
      }
    } catch (error) {
      this.logger.debug(`Product ${productId} not found in database, fetching from API...`);
    }

    // If not in database, fetch from API and save (like Amazon does)
    try {
      const productDetail = await this.walmartService.getWalmartProductDetail(productId);
      
      // Auto-save if user is authenticated (like Amazon saveAmazonProducts)
      if (userId) {
        const userCompanyId = await this.usersService.getUserCompanyId(userId);
        if (userCompanyId) {
          this.logger.debug(`Auto-saving product ${productId} to database for company ${userCompanyId}`);
          // Convert and save the product using existing saveWalmartProductPreview method
          const productToSave = this.convertToWalmartProduct(productDetail, userCompanyId);
          await this.walmartService.saveWalmartProductPreview([productToSave], userCompanyId);
        }
      }
      
      return productDetail;
    } catch (error) {
      throw new BadRequestException(`Failed to fetch product: ${error.message}`);
    }
  }

  private convertToWalmartProduct(productDetail: any, companyId: string) {
    // Get the first variant for price and image
    const firstVariant = productDetail.variants?.[0];
    
    // Safely handle images field - ensure it's a string
    let imageUrl = '';
    if (firstVariant?.thumbnail) {
      imageUrl = firstVariant.thumbnail;
    } else if (productDetail.images) {
      if (Array.isArray(productDetail.images)) {
        imageUrl = productDetail.images[0] || '';
      } else if (typeof productDetail.images === 'string') {
        imageUrl = productDetail.images;
      }
    }
    
    return {
      walmart_id: productDetail.sku || productDetail.id,
      price: firstVariant?.price || 0,
      image_url: imageUrl,
      product_url: productDetail.product_url,
      rating: productDetail.average_rating || 0,
      reviews_count: productDetail.total_reviews || 0,
      search_term: productDetail.product_name || '',
      title: productDetail.product_name || '',
      company_id: companyId,
    };
  }

  @Get('products/saved/:id')
  async getSavedProduct(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Missing product ID');
    }

    return this.walmartService.getSavedProduct(id);
  }

  @Post('products/:testId?')
  async saveWalmartProducts(
    @Body() { products }: SaveWalmartProductsDto,
    @Param('testId') testId?: string,
    @CurrentUser('id') userId?: any,
  ) {
    try {
      this.logger.debug('Walmart products save request', {
        testId,
        userId,
        productsCount: products?.length,
      });
      
      const userCompanyId = await this.usersService.getUserCompanyId(userId);

      if (!userCompanyId) {
        throw new BadRequestException('Missing company ID');
      }

      if (testId) {
        this.logger.debug(`Saving Walmart products with testId: ${testId}, companyId: ${userCompanyId}`);
        return await this.walmartService.saveWalmartProducts(
          products,
          testId,
          userCompanyId,
        );
      }

      this.logger.debug(`Saving Walmart products preview for companyId: ${userCompanyId}`);
      return await this.walmartService.saveWalmartProductPreview(products, userCompanyId);
    } catch (error) {
      this.logger.error('Walmart products save error', {
        errorType: error.constructor.name,
        errorMessage: error.message,
        testId,
        userId,
        productsCount: products?.length,
      });
      
      throw new BadRequestException(`Failed to save Walmart products: ${error.message}`);
    }
  }
}
