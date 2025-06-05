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
    }),
    ProlificModule,
    EmailModule
  ],
  providers: [TestMonitoringService, TestMonitoringProcessor],
  exports: [TestMonitoringService],
})
export class TestMonitoringModule {}
