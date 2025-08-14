/**
 * Pricing configuration constants
 * All amounts are in cents (smallest currency unit)
 */

export const PRICING = {
  // Credit pricing
  PRICE_PER_CREDIT_CENTS: 4900, // $49.00 per credit
  
  // Custom screening multiplier (10% increase)
  CUSTOM_SCREENING_MULTIPLIER: 1.1,
  
  // Credits per tester
  CREDITS_PER_TESTER: 1,
  CREDITS_PER_TESTER_WITH_CUSTOM_SCREENING: 1.1,
} as const;

// Export individual constants for convenience
export const PRICE_PER_CREDIT_CENTS = PRICING.PRICE_PER_CREDIT_CENTS;
export const CUSTOM_SCREENING_MULTIPLIER = PRICING.CUSTOM_SCREENING_MULTIPLIER;
export const CREDITS_PER_TESTER = PRICING.CREDITS_PER_TESTER;
export const CREDITS_PER_TESTER_WITH_CUSTOM_SCREENING = PRICING.CREDITS_PER_TESTER_WITH_CUSTOM_SCREENING;
