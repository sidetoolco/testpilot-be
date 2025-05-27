import { Module } from '@nestjs/common';
import { TestsService } from './tests.service';
import { SupabaseModule } from 'supabase/supabase.module';
import { TestsController } from './tests.controller';
import { ProlificModule } from 'prolific/prolific.module';

@Module({
  providers: [TestsService],
  imports: [SupabaseModule, ProlificModule],
  controllers: [TestsController],
  exports: [TestsService],
})
export class TestsModule {}
