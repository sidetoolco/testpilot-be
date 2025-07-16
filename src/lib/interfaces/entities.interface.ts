import { TestObjective } from 'tests/enums';
import { TestStatus } from 'tests/types/test-status.type';

export interface TestDemographics {
  id: string;
  test_id: string;
  age_ranges: string[];
  genders: string[];
  locations: string[];
  interests: string[];
  tester_count: number;
}

export interface TestSummary {
  id: number;
  created_at: string;
  test_id: string;
  variant_type: 'a' | 'b' | 'c';
  share_of_buy: number;
  share_of_click: number;
  value_score: number;
  win?: boolean;
  product_id: string;
}

export interface TestCompetitor {
  product_id: string;
  product: {
    id: string;
    title: string;
    price: number;
  };
}

export interface TestVariation {
  id: string;
  test_id: string;
  product_id: string;
  product: Product;
  variation_type: string;
  created_at: string;
  updated_at: string;
  prolific_status: string;
  prolific_test_id: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image_url: string;
  images: string[];
  rating: number;
  is_competitor: boolean;
  loads: number;
  product_url?: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  reviews_count: number;
  bullet_points: string[];
  brand?: string;
  responses_surveys: ResponseSurvey[];
}

export interface ResponseSurvey {
  id: string;
  brand: number;
  value: number;
  tester_id: string;
  appearance: number;
  confidence: number;
  created_at: Date;
  likes_most: string;
  convenience: number;
  improve_suggestions: string;
}

export interface ResponseComparison {
  id: string;
  test_id: string;
  product_id: string;
  created_at?: string;
  competitor_id: string;
  value?: number | null;
  appearance?: number | null;
  confidence?: number | null;
  brand?: number | null;
  convenience?: number | null;
  likes_most?: string | null;
  improve_suggestions?: string | null;
  choose_reason?: string | null;
  tester_id?: string | null;
}

export interface TestTime {
  id: string;
}

export interface ResponseSurvey {
  id: string;
  test_id: string;
  product_id: string;
  appearance: number;
  confidence: number;
  value: number;
  convenience: number;
  brand: number;
}

export interface AiInsight {
  id: number;
  created_at: string;
  test_id: string;
  variant_type: string;
  comparison_between_variants: string;
  purchase_drivers: string;
  competitive_insights: string;
  recommendations: string;
  comment_summary?: string;
  sendEmail?: boolean;
}

export interface Test {
  id: string;
  name: string;
  objective: TestObjective;
  status: TestStatus;
}

export interface Event {
  id: string;
  created_at: string;
  type: 'click';
  metadata: object;
  path: string;
}

export interface Invite {
  id: string;
  email: string;
  company_id: string;
  token: string;
  expires_at: string;
}

export interface CompanyCredits {
  id: string;
  company_id: string;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface CreditPayment {
  id: string;
  company_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  credits_purchased: number;
  status: 'pending' | 'completed' | 'failed' | 'canceled';
  created_at: string;
  updated_at: string;
}

export interface CompetitiveInsight {
  id: number;
  created_at: string;
  variant_type: 'a' | 'b' | 'c';
  competitor_product_id: string;
  share_of_buy: number;
  value: number;
  aesthetics: number;
  utility: number;
  trust: number;
  convenience: number;
  test_id: string;
  count: number;
}
