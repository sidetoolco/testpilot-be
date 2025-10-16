import { Result } from 'amazon/interfaces';

export const formatScraperResult = (results: Result[], searchTerm: string) => {
  const formattedResults = results
    .filter((r) => r.price !== undefined)
    .map((item) => {
      const asinMatch = item.url.match(/\/dp\/([A-Z0-9]{10})/);
      const asin = asinMatch ? asinMatch[1] : item.asin;

      return {
        title: item.name || '',
        price: item.price || 0,
        rating: item.stars || 0,
        reviews_count: 0, // Will be updated with real data from product page API
        image_url: item.image || '',
        product_url: item.url || '',
        search_term: searchTerm,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        asin: asin,
      };
    });

  // Remove records with duplicate titles
  const seenTitles = new Set();
  const uniqueResults = formattedResults.filter((record) => {
    if (seenTitles.has(record.title)) {
      return false; // Exclude record if title is already seen
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
        product.asin
      );
    })
    .sort((a, b) => (b.reviews_count || 0) - (a.reviews_count || 0));
};
