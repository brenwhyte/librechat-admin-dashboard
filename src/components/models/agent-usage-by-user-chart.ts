export interface AgentUsageByUserChart {
	agentId: string;
	totalInputToken: number;
	totalOutputToken: number;
	requests: number;
	hour?: string;
	day?: string;
	month?: string;
}
