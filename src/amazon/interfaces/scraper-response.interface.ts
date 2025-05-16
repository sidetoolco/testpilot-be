export interface ScraperResponse {
  ads: Ad[];
  results: Result[];
  explore_more_items: any[];
  next_pages: string[];
}

export interface Ad {
  name: string;
  asin: string;
  brand: string;
  image: string;
  has_prime: boolean;
  is_best_seller: boolean;
  is_amazon_choice: boolean;
  is_limited_deal: boolean;
  stars: number;
  total_reviews: number;
  url: string;
  type: string;
}

export interface Result {
  position: number;
  asin: string;
  name: string;
  image: string;
  has_prime: boolean;
  is_best_seller: boolean;
  is_amazon_choice: boolean;
  is_limited_deal: boolean;
  purchase_history_message: string;
  stars: number;
  total_reviews: number;
  url: string;
  price_string: string;
  price: number;
  original_price?: OriginalPrice;
  availability_quantity?: number;
}

export interface OriginalPrice {
  price_string: string;
  price: number;
}
