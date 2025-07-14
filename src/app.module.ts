import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { TestsModule } from './tests/tests.module';
import { InsightsModule } from './insights/insights.module';
import { ProlificModule } from './prolific/prolific.module';
import { ProductsModule } from './products/products.module';
import { OpenAiModule } from './open-ai/open-ai.module';
import { AdalineModule } from './adaline/adaline.module';
import { AmazonModule } from './amazon/amazon.module';
import { CacheModule } from '@nestjs/cache-manager';
import { UsersModule } from './users/users.module';
import { ScreeningModule } from './screening/screening.module';
import { TestMonitoringModule } from './test-monitoring/test-monitoring.module';
import { BullModule } from '@nestjs/bullmq';
import { EmailModule } from './email/email.module';
import { CompaniesModule } from './companies/companies.module';
import { CreditsModule } from './credits/credits.module';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        const isTLS = !redisUrl?.includes('localhost');

        return {
          connection: {
            url: redisUrl,
            ...(isTLS
              ? {
                  tls: {
                    rejectUnauthorized: false,
                  },
                }
              : {}),
            enableReadyCheck: false,
            enableOfflineQueue: false,
            retryStrategy: (times: number) => {
              if (times > 10) return null;
              return Math.min(times * 1000, 30000);
            },
            maxRetriesPerRequest: null,
            lazyConnect: true,
            keepAlive: 30000,
            connectTimeout: 30000,
            commandTimeout: 10000,
            disconnectTimeout: 5000,
            enableAutoPipelining: true,
            maxLoadingTimeout: 30000,
            retryDelayOnFailover: 100,
            retryDelayOnClusterDown: 300,
          },
          defaultJobOptions: {
            removeOnComplete: 5,
            removeOnFail: 3,
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 1000 * 60 * 60,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
    SupabaseModule,
    TestsModule,
    InsightsModule,
    ProlificModule,
    ProductsModule,
    OpenAiModule,
    AdalineModule,
    AmazonModule,
    CacheModule.register({ isGlobal: true, ttl: 86400 }),
    UsersModule,
    ScreeningModule,
    TestMonitoringModule,
    EmailModule,
    CompaniesModule,
    CreditsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
