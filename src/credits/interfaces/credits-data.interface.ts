import { Transaction } from "./transaction.interface";

export interface CreditsData {
    total: number;
    transactions: {
        data: Transaction[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }
}