import { Module } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { TestsModule } from 'tests/tests.module';
import { ProlificModule } from 'prolific/prolific.module';
import { ProductsModule } from 'products/products.module';

@Module({
  providers: [InsightsService],
  controllers: [InsightsController],
  imports: [TestsModule, ProlificModule, ProductsModule],
})
export class InsightsModule {}
