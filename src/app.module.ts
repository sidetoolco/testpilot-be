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
            lazyConnect: true,
            retryStrategy: (times: number) => {
              if (times > 2) {
                return 900000;
              }
              return 300000;
            },
            maxRetriesPerRequest: null,
            connectTimeout: 60000,
            commandTimeout: 30000,
            keepAlive: 600000,
            family: 4,
            enableOfflineQueue: false,
            maxLoadingTimeout: 60000,
            retryDelayOnFailover: 600000,
          },
          defaultJobOptions: {
            removeOnComplete: 1,
            removeOnFail: 1,
            attempts: 1,
            backoff: {
              type: 'exponential',
              delay: 600000,
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
