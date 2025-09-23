import { forwardRef, Module } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { TestsModule } from 'tests/tests.module';
import { ProlificModule } from 'prolific/prolific.module';
import { ProductsModule } from 'products/products.module';
import { SupabaseModule } from 'supabase/supabase.module';
import { OpenAiModule } from 'open-ai/open-ai.module';
import { AdalineModule } from 'adaline/adaline.module';
import { UsersModule } from 'users/users.module';

@Module({
  providers: [InsightsService],
  controllers: [InsightsController],
  imports: [
    forwardRef(() => TestsModule),
    ProlificModule,
    ProductsModule,
    SupabaseModule,
    OpenAiModule,
    AdalineModule,
    UsersModule,
  ],
  exports: [InsightsService],
})
export class InsightsModule {}
