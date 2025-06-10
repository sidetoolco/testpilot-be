import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AmazonService } from './amazon.service';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { SaveAmazonProductsDto} from './dto';
import { CurrentUser } from 'auth/decorators';
import { UsersService } from 'users/users.service';

@UseGuards(JwtAuthGuard)
@Controller('amazon')
export class AmazonController {
  constructor(
    private readonly amazonService: AmazonService,
    private readonly usersService: UsersService,
  ) {}

  @UseInterceptors(CacheInterceptor)
  @Get('products/:asin')
  async getProductDetail(@Param('asin') asin: string) {

    return this.amazonService.getProductDetail(asin);
  }

  @UseInterceptors(CacheInterceptor)
  @Get('products')
  async getAmazonProducts(@Query('term') searchTerm: string) {
    if (!searchTerm) {
      throw new BadRequestException('Missing searchTerm parameter');
    }

    return this.amazonService.queryAmazonProducts(searchTerm);
  }

  @Post('products')
  async saveAmazonProductPreview(
    @Body() { products }: SaveAmazonProductsDto,
    @CurrentUser('id') userId: any,
  ) {
    const userCompanyId = await this.usersService.getUserCompanyId(userId);

    if (!userCompanyId) {
      throw new BadRequestException('Missing company ID');
    }

    return this.amazonService.saveAmazonProductPreview(products, userCompanyId);
  }

  @Post('products/:testId')
  async saveAmazonProducts(
    @Body() { products }: SaveAmazonProductsDto,
    @Param('testId') testId: string,
    @CurrentUser('id') userId: any,
  ) {
    const userCompanyId = await this.usersService.getUserCompanyId(userId);

    if (!userCompanyId) {
      throw new BadRequestException('Missing company ID');
    }

    return this.amazonService.saveAmazonProducts(
      products,
      testId,
      userCompanyId,
    );
  }
}
