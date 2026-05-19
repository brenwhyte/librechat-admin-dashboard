export interface AgentUsageByUser {
	userId: string;
	email: string;
	name: string;
	agentId: string;
	agentName: string;
	totalInputToken: number;
	totalOutputToken: number;
	requests: number;
}
