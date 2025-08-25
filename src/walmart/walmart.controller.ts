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
  async getWalmartProductDetail(@Param('productId') productId: string) {
    if (!productId) {
      throw new BadRequestException('Missing productId parameter');
    }

    return this.walmartService.getWalmartProductDetail(productId);
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
