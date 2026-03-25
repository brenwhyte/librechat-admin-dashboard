export interface CostByUser {
	userId: string;
	email: string;
	name: string;
	domain: string;
	totalCost: number;
	totalTokens: number;
	transactionCount: number;
	costPercentage: number;
}
