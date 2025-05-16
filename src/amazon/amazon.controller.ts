import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AmazonService } from './amazon.service';

@Controller('amazon')
export class AmazonController {
  constructor(private readonly amazonService: AmazonService) {}

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
