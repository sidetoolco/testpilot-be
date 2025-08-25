import { Module } from '@nestjs/common';
import { WalmartController } from './walmart.controller';
import { WalmartService } from './walmart.service';
import { ScraperHttpClient } from '../amazon/scraper-http.client';
import { SupabaseModule } from 'supabase/supabase.module';
import { UsersModule } from 'users/users.module';

@Module({
  controllers: [WalmartController],
  providers: [WalmartService, ScraperHttpClient],
  imports: [SupabaseModule, UsersModule],
})
export class WalmartModule {}
