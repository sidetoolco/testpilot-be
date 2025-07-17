import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { CreditsModule } from 'credits/credits.module';
import { UsersModule } from 'users/users.module';

@Module({
  providers: [StripeService],
  controllers: [StripeController],
  exports: [StripeService],
  imports: [CreditsModule, UsersModule],
})
export class StripeModule {}
