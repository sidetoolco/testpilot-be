export interface ProlificStudyCostResponse {
  total_cost: number;
  breakdown: {
    rewards: number;
    fees: number;
    vat: number;
  };
}
