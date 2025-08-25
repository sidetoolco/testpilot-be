import { WalmartItem } from '../interfaces/walmart-response.interface';

export const formatWalmartResult = (items: WalmartItem[], searchTerm: string) => {
  const formattedResults = items
    .filter((item) => item.price !== undefined)
    .map((item) => {
      return {
        walmart_id: item.id, // Walmart product ID (like "105XZBDBG2G0")
        title: item.name || '',
        price: item.price || 0,
        rating: item.rating?.average_rating || 0,
        reviews_count: item.rating?.number_of_reviews || 0,
        image_url: item.image || '',
        product_url: item.url || '',
        search_term: searchTerm,
      };
    });

  // Remove records with duplicate titles
  const seenTitles = new Set();
  const uniqueResults = formattedResults.filter((record) => {
    if (seenTitles.has(record.title)) {
      return false;
    }
    seenTitles.add(record.title);
    return true;
  });

  return uniqueResults
    .filter((product) => {
      return (
        typeof product === 'object' &&
        product !== null &&
        'title' in product &&
        typeof product.title === 'string' &&
        product.walmart_id
      );
    })
    .sort((a, b) => (b.reviews_count || 0) - (a.reviews_count || 0));
};
