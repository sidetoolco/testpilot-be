import { TikTokSearchProduct } from '../interfaces/tiktok-response.interface';

export const formatTikTokResult = (
  products: TikTokSearchProduct[],
  searchTerm: string,
) => {
  const formatted = products
    .map((item) => {
      const imageUrl =
        item.image?.url_list?.[0] ||
        (item.image?.uri
          ? `https://p16-oec-general-useast5.ttcdn-us.com/${item.image.uri}`
          : '');

      const priceRaw = item.product_price_info?.sale_price_decimal;
      const price = priceRaw ? parseFloat(priceRaw) : 0;

      const rating =
        item.rate_info?.score != null ? Number(item.rate_info.score) : null;

      const reviewCountRaw = item.rate_info?.review_count;
      const reviews_count =
        reviewCountRaw != null ? Number(reviewCountRaw) : null;

      const productUrl =
        item.seo_url?.canonical_url || item.seo_url?.pdp_url || '';

      const brand = item.seller_info?.shop_name || null;

      return {
        tiktok_id: item.product_id,
        title: item.title || '',
        price,
        rating,
        reviews_count,
        image_url: imageUrl,
        product_url: productUrl,
        search_term: searchTerm,
        brand,
      };
    })
    .filter((p) => p.price > 0 && p.tiktok_id);

  const seen = new Set<string>();
  return formatted
    .filter((p) => {
      if (seen.has(p.tiktok_id)) return false;
      seen.add(p.tiktok_id);
      return true;
    })
    .sort((a, b) => (b.reviews_count || 0) - (a.reviews_count || 0));
};
