import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditsService } from 'credits/credits.service';
import { PaymentStatus } from 'credits/enums';
import Stripe from 'stripe';
import { CreateCouponDto, UpdateCouponDto, ListCouponsDto } from './dto';

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
    couponId?: string,
  ) {
    let finalAmount = amount * 100; // Convert to cents
    let couponDetails = null;

    // Ensure minimum base amount (50 cents for USD)
    if (finalAmount < 50) {
      throw new BadRequestException('Payment amount must be at least $0.50');
    }

    try {
      // If coupon is provided, validate it and calculate discount
      if (couponId) {
        try {
          const coupon = await this.stripe.coupons.retrieve(couponId);
          
          if (!coupon.valid) {
            throw new BadRequestException('Coupon is not valid');
          }

          // Calculate discount
          if (coupon.percent_off) {
            finalAmount = Math.round(finalAmount * (1 - coupon.percent_off / 100));
          } else if (coupon.amount_off) {
            finalAmount = Math.max(0, finalAmount - coupon.amount_off);
          }

          // Ensure minimum amount (50 cents for USD)
          if (finalAmount < 50) {
            throw new BadRequestException('Coupon discount too large - minimum payment amount is $0.50');
          }

          couponDetails = {
            id: coupon.id,
            name: coupon.name,
            percent_off: coupon.percent_off,
            amount_off: coupon.amount_off,
          };

          this.logger.log(`Applied coupon ${couponId} with discount: ${coupon.percent_off ? coupon.percent_off + '%' : coupon.amount_off + ' cents'}`);
        } catch (error) {
          this.logger.error(`Error retrieving coupon ${couponId}:`, error);
          throw new BadRequestException('Invalid or expired coupon');
        }
      }

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: finalAmount,
        currency: 'usd',
        metadata: {
          companyId,
          credits: credits.toString(),
          originalAmount: (amount * 100).toString(),
          couponId: couponId || '',
          couponName: couponDetails?.name || '',
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      await this.creditsService.createPendingPayment(
        companyId,
        paymentIntent.id,
        finalAmount,
        credits,
      );

      this.logger.log(
        `Created payment intent ${paymentIntent.id} for company ${companyId} with coupon ${couponId || 'none'} - Amount: ${finalAmount} cents (original: ${amount * 100} cents)`,
      );

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: finalAmount,
        originalAmount: amount * 100,
        coupon: couponDetails,
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

  /**
   * Create a new coupon
   */
  public async createCoupon(couponData: CreateCouponDto): Promise<Stripe.Coupon> {
    try {
      const coupon = await this.stripe.coupons.create(couponData);
      this.logger.log(`Created coupon ${coupon.id}`);
      return coupon;
    } catch (error) {
      this.logger.error('Error creating coupon:', error);
      throw error;
    }
  }

  /**
   * Update an existing coupon
   */
  public async updateCoupon(
    couponId: string,
    updateData: UpdateCouponDto,
  ): Promise<Stripe.Coupon> {
    try {
      const coupon = await this.stripe.coupons.update(couponId, updateData);
      this.logger.log(`Updated coupon ${couponId}`);
      return coupon;
    } catch (error) {
      this.logger.error(`Error updating coupon ${couponId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve a specific coupon
   */
  public async retrieveCoupon(couponId: string): Promise<Stripe.Coupon> {
    try {
      const coupon = await this.stripe.coupons.retrieve(couponId);
      this.logger.log(`Retrieved coupon ${couponId}`);
      return coupon;
    } catch (error) {
      this.logger.error(`Error retrieving coupon ${couponId}:`, error);
      throw error;
    }
  }

  /**
   * List all coupons with optional filtering
   */
  public async listCoupons(params?: ListCouponsDto): Promise<Stripe.ApiList<Stripe.Coupon>> {
    try {
      const coupons = await this.stripe.coupons.list(params);
      this.logger.log(`Listed ${coupons.data.length} coupons`);
      return coupons;
    } catch (error) {
      this.logger.error('Error listing coupons:', error);
      throw error;
    }
  }

  /**
   * Delete a coupon
   */
  public async deleteCoupon(couponId: string): Promise<Stripe.DeletedCoupon> {
    try {
      const deletedCoupon = await this.stripe.coupons.del(couponId);
      this.logger.log(`Deleted coupon ${couponId}`);
      return deletedCoupon;
    } catch (error) {
      this.logger.error(`Error deleting coupon ${couponId}:`, error);
      throw error;
    }
  }

  /**
   * Find coupon by code (ID or name)
   */
  public async findCouponByCode(couponCode: string): Promise<Stripe.Coupon | null> {
    try {
      // First try to retrieve by ID (in case the code is actually an ID)
      try {
        const coupon = await this.stripe.coupons.retrieve(couponCode);
        this.logger.log(`Found coupon by ID: ${couponCode}`);
        return coupon;
      } catch (idError) {
        // If not found by ID, search by name
        this.logger.log(`Coupon not found by ID ${couponCode}, searching by name...`);
      }

      // Search for coupon by name with pagination to handle all coupons
      let hasMore = true;
      let startingAfter: string | undefined = undefined;
      
      while (hasMore) {
        const params: Stripe.CouponListParams = { limit: 100 };
        if (startingAfter) {
          params.starting_after = startingAfter;
        }
        
        const coupons = await this.stripe.coupons.list(params);
        
        // Search in current batch
        const coupon = coupons.data.find(c => c.name === couponCode);
        if (coupon) {
          this.logger.log(`Found coupon by name: ${couponCode}`);
          return coupon;
        }
        
        // Check if there are more coupons to search
        hasMore = coupons.has_more;
        if (hasMore && coupons.data.length > 0) {
          startingAfter = coupons.data[coupons.data.length - 1].id;
        }
      }

      this.logger.log(`Coupon not found: ${couponCode}`);
      return null;
    } catch (error) {
      this.logger.error(`Error finding coupon ${couponCode}:`, error);
      return null;
    }
  }
}
