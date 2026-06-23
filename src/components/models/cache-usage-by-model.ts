export interface CacheUsageByModel {
	model: string;
	endpoint: string;
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
	hitRate: number;
}
