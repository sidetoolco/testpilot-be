export interface WalmartResponse {
  items: WalmartItem[];
  meta: WalmartMeta;
}

export interface WalmartItem {
  availability: string;
  id: string;
  image: string;
  name: string;
  price: number;
  rating: WalmartRating;
  seller: string;
  url: string;
}

export interface WalmartRating {
  average_rating: number;
  number_of_reviews: number;
}

export interface WalmartMeta {
  page: number;
  pages: number;
}
