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
