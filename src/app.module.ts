import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { TestsModule } from './tests/tests.module';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    TestsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
