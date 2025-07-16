import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StripeService } from './stripe.service';
import { CompanyGuard, JwtAuthGuard } from 'auth/guards';
import { CompanyId } from 'auth/decorators';
import { CreatePaymentIntentDto } from './dto';

@Controller('stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(private readonly stripeService: StripeService) {}

  @Post('/payment-intent')
  @UseGuards(JwtAuthGuard, CompanyGuard)
  async createPaymentIntent(
    @CompanyId() companyId: string,
    @Body() { credits }: CreatePaymentIntentDto,
  ) {
    return await this.stripeService.createPaymentIntent(
      companyId,
      credits * 49,
      credits,
    ); // I don't like having the price directly embedded here.
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebook(
    @Headers('stripe-signature') signature: string,
    @Req() request: Body,
  ) {
    try {
      return await this.stripeService.handleWebhook(signature, request.body as any as Buffer);
    } catch (error) {
      this.logger.error('Webhook error:', error);
      return { received: false, error: error.message };
    }
  }
}
