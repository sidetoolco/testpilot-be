import { Module } from '@nestjs/common';
import { TestsService } from './tests.service';
import { SupabaseModule } from 'supabase/supabase.module';
import { TestsController } from './tests.controller';

@Module({
  providers: [TestsService],
  imports: [SupabaseModule],
  controllers: [TestsController],
})
export class TestsModule {}
