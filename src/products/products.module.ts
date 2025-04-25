import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { SupabaseModule } from 'supabase/supabase.module';

@Module({
  providers: [ProductsService],
  imports: [SupabaseModule],
  exports: [ProductsService],
})
export class ProductsModule {}
