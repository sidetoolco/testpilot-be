import { Module } from '@nestjs/common';
import { TestMonitoringService } from './test-monitoring.service';
import { BullModule } from '@nestjs/bullmq';
import { ProlificModule } from 'prolific/prolific.module';
import { TestMonitoringProcessor } from './test-monitoring.processor';
import { EmailModule } from 'email/email.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'test-completion',
      defaultJobOptions: {
        removeOnComplete: 5,
        removeOnFail: 3,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000 * 60, // 1 minute
        },
      },
    }),
    ProlificModule,
    EmailModule
  ],
  providers: [TestMonitoringService, TestMonitoringProcessor],
  exports: [TestMonitoringService],
})
export class TestMonitoringModule {}
