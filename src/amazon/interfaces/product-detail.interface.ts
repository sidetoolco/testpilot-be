export interface ProductDetail {
  name: string;
  product_information: ProductInformation;
  brand: string;
  brand_url: string;
  full_description: string;
  pricing: string;
  list_price: string;
  shipping_price: string;
  shipping_time: string;
  shipping_condition: string;
  availability_status: string;
  is_coupon_exists: boolean;
  images: string[];
  product_category: string;
  average_rating: number;
  feature_bullets: string[];
  total_reviews: number;
  model: string;
  customization_options: CustomizationOptions;
  ships_from: string;
  sold_by: string;
  aplus_present: boolean;
  total_ratings: number;
  '5_star_percentage': number;
  '4_star_percentage': number;
  '3_star_percentage': number;
  '2_star_percentage': number;
  '1_star_percentage': number;
  reviews: Review[];
}

export interface CustomizationOptions {
  flavor_name: FlavorName[];
  size: Size[];
}

export interface FlavorName {
  asin: string;
  is_selected: boolean;
  value: string;
}

export interface Size {
  asin: string;
  is_selected: boolean;
}

export interface ProductInformation {
  product_dimensions: string;
  item_model_number: string;
  upc: string;
  manufacturer: string;
  asin: string;
  country_of_origin: string;
  units: string;
  best_sellers_rank: string[];
  customer_reviews: CustomerReviews;
}

export interface CustomerReviews {
  ratings_count: number;
  stars: number;
}

export interface Review {
  stars: number;
  date: string;
  verified_purchase: boolean;
  manufacturer_replied: boolean;
  username: string;
  user_url?: string;
  title: string;
  review: string;
  review_url?: string;
  total_found_helpful?: number;
  images: any[];
}
