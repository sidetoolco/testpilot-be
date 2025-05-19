import { Module } from '@nestjs/common';
import { AmazonController } from './amazon.controller';
import { AmazonService } from './amazon.service';
import { ScraperHttpClient } from './scraper-http.client';
import { SupabaseModule } from 'supabase/supabase.module';
import { UsersModule } from 'users/users.module';

@Module({
  controllers: [AmazonController],
  providers: [AmazonService, ScraperHttpClient],
  imports: [SupabaseModule, UsersModule],
})
export class AmazonModule {}
