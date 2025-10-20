import { Review } from './product-detail.interface';

export interface ReviewsResponse {
  product_name: string;
  asin: string;
  average_rating: number;
  total_reviews: number;
  rating_breakdown: {
    five_star: number;
    four_star: number;
    three_star: number;
    two_star: number;
    one_star: number;
  };
  reviews: Review[];
}

