export interface ProlificBalance {
  currency_code: string;
  total_balance: number;
  balance_breakdown: {
    rewards: number;
    fees: number;
    vat: number;
  };
  available_balance: number;
  available_balance_breakdown: {
    rewards: number;
    fees: number;
    vat: number;
  };
}
