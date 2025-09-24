import { forwardRef, Module } from '@nestjs/common';
import { TestMonitoringService } from './test-monitoring.service';
import { BullModule } from '@nestjs/bullmq';
import { ProlificModule } from 'prolific/prolific.module';
import { TestMonitoringProcessor } from './test-monitoring.processor';
import { EmailModule } from 'email/email.module';
import { TestsModule } from 'tests/tests.module';

const enableBullWorker = process.env.ENABLE_BULLMQ_WORKER === 'true' && Boolean(process.env.REDIS_URL);

@Module({
  imports: [
    // Only register BullMQ queue if Redis is configured and worker is enabled
    ...(enableBullWorker ? [
      BullModule.registerQueue({
        name: 'test-completion',
      })
    ] : []),
    ProlificModule,
    EmailModule,
    forwardRef(() => TestsModule)
  ],
  providers: [
    TestMonitoringService,
    ...(enableBullWorker ? [TestMonitoringProcessor] : []),
  ],
  exports: [TestMonitoringService],
})
export class TestMonitoringModule {}
