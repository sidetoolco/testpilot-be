import { forwardRef, Module } from '@nestjs/common';
import { TestMonitoringService } from './test-monitoring.service';
import { ProlificModule } from 'prolific/prolific.module';
import { EmailModule } from 'email/email.module';
import { TestsModule } from 'tests/tests.module';
import { SupabaseModule } from 'supabase/supabase.module';

@Module({
  imports: [
    SupabaseModule,
    ProlificModule,
    EmailModule,
    forwardRef(() => TestsModule)
  ],
  providers: [TestMonitoringService],
  exports: [TestMonitoringService],
})
export class TestMonitoringModule {}
