export interface CompetitiveInsights {
  [competitorProductId: string]: {
    title: string;
    price: number;
    variants: {
      [variantType: string]: {
        share_of_buy: number | null;
        value: number | null;
        aesthetics: number | null;
        utility: number | null;
        trust: number | null;
        convenience: number | null;
      };
    };
  };
}
