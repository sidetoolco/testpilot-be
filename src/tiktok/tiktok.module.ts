import { Module } from '@nestjs/common';
import { TikTokController } from './tiktok.controller';
import { TikTokService } from './tiktok.service';
import { ScrapeCreatorsHttpClient } from './scrape-creators-http.client';
import { SupabaseModule } from 'supabase/supabase.module';
import { UsersModule } from 'users/users.module';

@Module({
  controllers: [TikTokController],
  providers: [TikTokService, ScrapeCreatorsHttpClient],
  imports: [SupabaseModule, UsersModule],
})
export class TikTokModule {}
