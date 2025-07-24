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
  Get,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { StripeService } from './stripe.service';
import { CompanyGuard, JwtAuthGuard } from 'auth/guards';
import { CompanyId } from 'auth/decorators';
import { CreatePaymentIntentDto, CreateCouponDto, UpdateCouponDto, ListCouponsDto } from './dto';

@Controller('stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(private readonly stripeService: StripeService) {}

  @Post('/payment-intent')
  @UseGuards(JwtAuthGuard, CompanyGuard)
  async createPaymentIntent(
    @CompanyId() companyId: string,
    @Body() { credits, couponId }: CreatePaymentIntentDto,
  ) {
    return await this.stripeService.createPaymentIntent(
      companyId,
      credits * 49,
      credits,
      couponId,
    );
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

  // Coupon endpoints
  @Post('/coupons')
  @UseGuards(JwtAuthGuard, CompanyGuard)
  async createCoupon(@Body() couponData: CreateCouponDto) {
    return await this.stripeService.createCoupon(couponData);
  }

  @Get('/coupons')
  @UseGuards(JwtAuthGuard, CompanyGuard)
  async listCoupons(@Query() query: ListCouponsDto) {
    return await this.stripeService.listCoupons(query);
  }

  // ✅ NEW: Validate coupon by code (for frontend) - MUST come before /:id routes
  @Get('/coupons/validate/:code')
  @UseGuards(JwtAuthGuard, CompanyGuard)
  async validateCouponByCode(@Param('code') couponCode: string) {
    try {
      const coupon = await this.stripeService.findCouponByCode(couponCode);
      
      if (!coupon) {
        return {
          valid: false,
          error: 'Coupon not found',
        };
      }

      if (!coupon.valid) {
        return {
          valid: false,
          error: 'Coupon is expired or invalid',
        };
      }

      return {
        valid: true,
        coupon: {
          id: coupon.id,
          name: coupon.name,
          percent_off: coupon.percent_off,
          amount_off: coupon.amount_off,
          currency: coupon.currency,
        },
      };
    } catch (error) {
      this.logger.error(`Error validating coupon ${couponCode}:`, error);
      return {
        valid: false,
        error: 'Invalid or expired coupon',
      };
    }
  }

  @Post('/coupons/:id')
  @UseGuards(JwtAuthGuard, CompanyGuard)
  async updateCoupon(
    @Param('id') couponId: string,
    @Body() updateData: UpdateCouponDto,
  ) {
    return await this.stripeService.updateCoupon(couponId, updateData);
  }

  @Get('/coupons/:id')
  @UseGuards(JwtAuthGuard, CompanyGuard)
  async retrieveCoupon(@Param('id') couponId: string) {
    return await this.stripeService.retrieveCoupon(couponId);
  }

  @Delete('/coupons/:id')
  @UseGuards(JwtAuthGuard, CompanyGuard)
  async deleteCoupon(@Param('id') couponId: string) {
    return await this.stripeService.deleteCoupon(couponId);
  }


}
