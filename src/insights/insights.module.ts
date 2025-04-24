import { Module } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { TestsModule } from 'tests/tests.module';

@Module({
  providers: [InsightsService],
  controllers: [InsightsController],
  imports: [TestsModule]
})
export class InsightsModule {}
