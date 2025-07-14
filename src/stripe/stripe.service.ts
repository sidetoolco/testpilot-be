import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditsService } from 'credits/credits.service';
import { PaymentStatus } from 'credits/enums';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly creditsService: CreditsService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY'));
  }

  public async createPaymentIntent(
    companyId: string,
    amount: number,
    credits: number,
  ) {
    const amountCents = amount * 100; // Convert to cents

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        metadata: {
          companyId,
          credits: credits.toString(),
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      await this.creditsService.createPendingPayment(
        companyId,
        paymentIntent.id,
        amountCents,
        credits,
      );

      this.logger.log(
        `Created payment intent ${paymentIntent.id} for company ${companyId}`,
      );

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    } catch (error) {
      this.logger.error('Error creating payment intent:', error);
      throw error;
    }
  }

  public async handleWebhook(signature: string, payload: Buffer) {
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (error) {
      this.logger.error('Webhook signature verification failed:', error);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Received webhook event: ${event.type}`);

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePayment(PaymentStatus.COMPLETED, event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePayment(PaymentStatus.FAILED, event.data.object);
          break;
        case 'payment_intent.canceled':
          await this.handlePayment(PaymentStatus.CANCELED, event.data.object);
          break;
        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }

      return { received: true, event: event.type };
    } catch (error) {
      this.logger.error(`Error processing webhook ${event.type}:`, error);
      throw error;
    }
  }

  private async handlePayment(
    status: PaymentStatus,
    paymentIntent: Stripe.PaymentIntent,
  ) {
    try {
      await this.creditsService.updatePaymentStatus(paymentIntent.id, status);
    } catch (error) {
      this.logger.error(
        `Failed to update payment status for ${paymentIntent.id}:`,
        error,
      );
    }
  }
}
