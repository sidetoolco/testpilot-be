export interface Transaction {
    id: string;
    type: "payment" | "usage";
    amount_cents?: number;
    credits: number;
    status: string;
    test_id?: string;
    created_at: string;
}