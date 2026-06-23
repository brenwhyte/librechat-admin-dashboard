export interface CacheUsageByUser {
	userId: string;
	email: string;
	name: string;
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
	hitRate: number;
}
