import { Review } from './product-detail.interface';

export interface AmazonProductEntity {
  id?: string;
  asin: string;
  title: string;
  price: number;
  rating: number;
  reviews_count: number;
  image_url: string;
  product_url: string;
  search_term: string;
  company_id?: string;
  created_at?: string;
  updated_at?: string;
  bullet_points?: string[];
  images?: string[];
  reviews?: Review[];
}

