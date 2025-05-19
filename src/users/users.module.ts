import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { SupabaseModule } from 'supabase/supabase.module';

@Module({
  providers: [UsersService],
  imports: [SupabaseModule],
  exports: [UsersService],
})
export class UsersModule {}
