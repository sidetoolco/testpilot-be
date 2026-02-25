import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
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
import { WalmartModule } from './walmart/walmart.module';
import { TikTokModule } from './tiktok/tiktok.module';
import { CacheModule } from '@nestjs/cache-manager';
import { UsersModule } from './users/users.module';
import { ScreeningModule } from './screening/screening.module';
import { TestMonitoringModule } from './test-monitoring/test-monitoring.module';
import { BullModule } from '@nestjs/bullmq';
import { EmailModule } from './email/email.module';
import { CompaniesModule } from './companies/companies.module';
import { CreditsModule } from './credits/credits.module';
import { StripeModule } from './stripe/stripe.module';
import { JsonBodyMiddleware, RawBodyMiddleware } from 'lib/middlewares';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    // Only initialize BullMQ if Redis is configured and worker is enabled
    ...(process.env.REDIS_URL && process.env.ENABLE_BULLMQ_WORKER === 'true' ? [
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
              enableAutoPipelining: true,
              retryStrategy: (times: number) => {
                if (times > 5) return null;
                return Math.pow(2, times) * 100;
              },
              // Reduce Redis requests by limiting retries and connections
              lazyConnect: true,
              maxRetriesPerRequest: 1,
              enableOfflineQueue: false,
            },
            // Global settings to reduce polling
            defaultJobOptions: {
              removeOnComplete: 10,
              removeOnFail: 5,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            },
            // Disable polling completely by using blocking connections
            blockingConnection: true,
          };
        },
        inject: [ConfigService],
      })
    ] : []),
    SupabaseModule,
    TestsModule,
    InsightsModule,
    ProlificModule,
    ProductsModule,
    OpenAiModule,
    AdalineModule,
    AmazonModule,
    WalmartModule,
    TikTokModule,
    CacheModule.register({ isGlobal: true, ttl: 86400 }),
    UsersModule,
    ScreeningModule,
    TestMonitoringModule,
    EmailModule,
    CompaniesModule,
    CreditsModule,
    StripeModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes({
        path: '/stripe/webhook',
        method: RequestMethod.POST,
      })
      .apply(JsonBodyMiddleware)
      .forRoutes('*');
  }
}
