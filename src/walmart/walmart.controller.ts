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
      console.log(`Product ${id} not found in saved products, trying Walmart API...`);
    }

    // If not found in saved products, try to get from Walmart API
    try {
      return await this.walmartService.getWalmartProductDetail(id);
    } catch (error) {
      throw new BadRequestException(`Product not found: ${id}`);
    }
  }

  @UseInterceptors(CacheInterceptor)
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
      const savedProduct = await this.walmartService.getSavedProduct(productId);
      if (savedProduct) {
        console.log(`Product ${productId} found in database, returning cached data`);
        return savedProduct; // Return cached data
      }
    } catch (error) {
      console.log(`Product ${productId} not found in database, fetching from API...`);
    }

    // If not in database, fetch from API and save (like Amazon does)
    try {
      const productDetail = await this.walmartService.getWalmartProductDetail(productId);
      
      // Auto-save if user is authenticated (like Amazon saveAmazonProducts)
      if (userId) {
        const userCompanyId = await this.usersService.getUserCompanyId(userId);
        if (userCompanyId) {
          console.log(`Auto-saving product ${productId} to database for company ${userCompanyId}`);
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
    
    return {
      walmart_id: productDetail.sku || productDetail.id,
      price: firstVariant?.price || 0,
      image_url: firstVariant?.thumbnail || productDetail.images || '',
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
      console.log('=== WALMART PRODUCTS SAVE REQUEST ===');
      console.log('Test ID:', testId);
      console.log('User ID:', userId);
      console.log('Products count:', products?.length);
      console.log('First product sample:', JSON.stringify(products?.[0], null, 2));
      
      const userCompanyId = await this.usersService.getUserCompanyId(userId);

      if (!userCompanyId) {
        throw new BadRequestException('Missing company ID');
      }

      if (testId) {
        console.log(`Saving Walmart products with testId: ${testId}, companyId: ${userCompanyId}`);
        return await this.walmartService.saveWalmartProducts(
          products,
          testId,
          userCompanyId,
        );
      }

      console.log(`Saving Walmart products preview for companyId: ${userCompanyId}`);
      return await this.walmartService.saveWalmartProductPreview(products, userCompanyId);
    } catch (error) {
      console.error('=== WALMART PRODUCTS SAVE ERROR ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error details:', error);
      
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
      
      throw new BadRequestException(`Failed to save Walmart products: ${error.message}`);
    }
  }
}
