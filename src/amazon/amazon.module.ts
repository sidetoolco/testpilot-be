import { Module } from '@nestjs/common';
import { AmazonController } from './amazon.controller';
import { AmazonService } from './amazon.service';
import { ScraperHttpClient } from './scraper-http.client';

@Module({
  controllers: [AmazonController],
  providers: [AmazonService, ScraperHttpClient]
})
export class AmazonModule {}
