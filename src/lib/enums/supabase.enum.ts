export enum TableName {
  TESTS = 'tests',
  TEST_DEMOGRAPHICS = 'test_demographics',
  TEST_COMPETITORS = 'test_competitors',
  TEST_VARIATIONS = 'test_variations',
  PRODUCTS = 'products',
  TEST_TIMES = 'test_times',
  RESPONSES_SURVEYS = 'responses_surveys',
  RESPONSES_COMPARISONS = 'responses_comparisons',
  INSIGHT_STATUS = 'insight_status',
  AI_INSIGHTS = 'ia_insights',
  TEST_SUMMARY = 'summary',
  PURCHASE_DRIVERS = 'purchase_drivers',
  COMPETITIVE_INSIGHTS = 'competitive_insights',
  TESTERS_SESSION = 'testers_session',
  AMAZON_PRODUCTS = 'amazon_products',
  PROFILES = 'profiles',
  EVENTS = 'events',
  COMPANY_INVITES = 'invites',
  COMPANY_CREDITS = 'company_credits',
  CREDIT_PAYMENTS = 'credit_payments',
  CREDIT_USAGE = 'credit_usage',
}

export enum Rpc {
  GET_COMPETITOR_INSIGHTS = 'get_competitive_insights_by_competitor',
  GET_COMPANY_TRANSACTION_HISTORY = 'get_company_transaction_history',
}
