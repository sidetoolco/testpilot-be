import { BadRequestException, Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AmazonService } from './amazon.service';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { JwtAuthGuard } from 'auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('amazon')
export class AmazonController {
  constructor(private readonly amazonService: AmazonService) {}

  @UseInterceptors(CacheInterceptor)
  @Get('products')
  async getAmazonProducts(
    @Query('term') searchTerm: string,
  ) {
    if (!searchTerm) {
      return new BadRequestException('Missing searchTerm parameter');
    }

    return this.amazonService.queryAmazonProducts(searchTerm);
  }
}
