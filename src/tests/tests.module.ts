import { forwardRef, Module } from '@nestjs/common';
import { TestsService } from './tests.service';
import { SupabaseModule } from 'supabase/supabase.module';
import { TestsController } from './tests.controller';
import { ProlificModule } from 'prolific/prolific.module';
import { TestMonitoringModule } from 'test-monitoring/test-monitoring.module';

@Module({
  providers: [TestsService],
  imports: [SupabaseModule, forwardRef(() => ProlificModule), TestMonitoringModule],
  controllers: [TestsController],
  exports: [TestsService],
})
export class TestsModule {}
