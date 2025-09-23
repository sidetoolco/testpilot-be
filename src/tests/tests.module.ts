import { forwardRef, Module } from '@nestjs/common';
import { TestsService } from './tests.service';
import { SupabaseModule } from 'supabase/supabase.module';
import { TestsController } from './tests.controller';
import { ProlificModule } from 'prolific/prolific.module';
import { TestMonitoringModule } from 'test-monitoring/test-monitoring.module';
import { TestStatusGateway } from './gateways/test-status.gateway';
import { CreditsModule } from 'credits/credits.module';
import { UsersModule } from 'users/users.module';
import { InsightsModule } from 'insights/insights.module';

@Module({
  providers: [TestsService, TestStatusGateway],
  imports: [
    SupabaseModule,
    forwardRef(() => ProlificModule),
    TestMonitoringModule,
    CreditsModule,
    UsersModule,
    forwardRef(() => InsightsModule),
  ],
  controllers: [TestsController],
  exports: [TestsService],
})
export class TestsModule {}
