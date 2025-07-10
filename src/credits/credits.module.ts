import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { SupabaseModule } from 'supabase/supabase.module';
import { UsersModule } from 'users/users.module';

@Module({
  providers: [CreditsService],
  controllers: [CreditsController],
  imports: [SupabaseModule, UsersModule],
})
export class CreditsModule {}
