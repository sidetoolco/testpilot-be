import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { SupabaseModule } from 'supabase/supabase.module';
import { EmailModule } from 'email/email.module';

@Module({
  providers: [CompaniesService],
  controllers: [CompaniesController],
  imports: [SupabaseModule, EmailModule],
})
export class CompaniesModule {}
