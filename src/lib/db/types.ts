/**
 * Common TypeScript interfaces for database documents
 */

export interface Message {
	_id?: string;
	messageId: string;
	parentMessageId?: string;
	conversationId: string;
	user: string;
	sender: string;
	model: string | null;
	endpoint: string;
	tokenCount: number;
	summaryTokenCount?: number;
	createdAt: Date;
}

export interface User {
	_id?: string;
	userId: string;
	email?: string;
	name?: string;
	createdAt: Date;
}

export interface Agent {
	_id?: string;
	id: string;
	name: string;
	model: string;
	provider: string;
	createdAt: Date;
}

/**
 * Query result types
 */

export interface DateRange {
	startDate: Date;
	endDate: Date;
}

export interface PeriodComparison extends DateRange {
	prevStart: Date;
	prevEnd: Date;
}

export interface ActiveUsersResult {
	currentActiveUsers: number | null;
	prevActiveUsers: number | null;
}

export interface ConversationsResult {
	currentConversations: number | null;
	prevConversations: number | null;
}

export interface McpToolCallsResult {
	currentMcpToolCalls: number | null;
	prevMcpToolCalls: number | null;
}

export interface TokenCountResult {
	currentInputToken: number | null;
	currentOutputToken: number | null;
	prevInputToken: number | null;
	prevOutputToken: number | null;
}

export interface MessageStatsResult {
	totalMessages: number | null;
	totalTokenCount: number | null;
	totalSummaryTokenCount: number | null;
	prevTotalMessages: number | null;
	prevTotalTokenCount: number | null;
	prevTotalSummaryTokenCount: number | null;
}

export interface HeatMapEntry {
	dayOfWeek: number;
	timeSlot: number;
	totalRequests: number;
}

export interface ModelUsageEntry {
	_id: string;
	totalTokenCount: number;
	models: Array<{
		name: string;
		tokenCount: number;
		agentName?: string;
	}>;
}

export interface StatsTableEntry {
	model: string;
	endpoint: string;
	agentName?: string;
	totalInputToken: number;
	totalOutputToken: number;
	requests: number;
	tokenMedian?: number;
	avg?: number;
}

export interface TimeSeriesEntry {
	model?: string;
	agentId?: string;
	agentName?: string;
	endpoint: string;
	day?: string;
	hour?: string;
	month?: string;
	totalInputToken: number;
	totalOutputToken: number;
	requests: number;
}

/**
 * Agent usage broken down by user
 */
export interface AgentUsageByUserEntry {
	userId: string;
	email: string;
	name: string;
	agentId: string;
	agentName: string;
	totalInputToken: number;
	totalOutputToken: number;
	requests: number;
}

/**
 * Cache token statistics with period comparison
 */
export interface CacheTokenSummaryResult {
	currentWriteTokens: number;
	currentReadTokens: number;
	currentInputTokens: number;
	prevWriteTokens: number;
	prevReadTokens: number;
	prevInputTokens: number;
}

/**
 * Cache token time series entry (one bucket per day/hour/month)
 */
export interface CacheTokenTimeSeriesEntry {
	day?: string;
	hour?: string;
	month?: string;
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
}

/**
 * Cache token usage broken down by user
 */
export interface CacheUsageByUserEntry {
	userId: string;
	email: string;
	name: string;
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
	hitRate: number;
}

/**
 * Cache token usage broken down by model/endpoint
 */
export interface CacheUsageByModelEntry {
	model: string;
	endpoint: string;
	inputTokens: number;
	writeTokens: number;
	readTokens: number;
	hitRate: number;
}

/**
 * Aggregation granularity for time series data
 */
export type TimeGranularity = "hour" | "day" | "month";

/**
 * Pipeline builder options
 */
export interface TimeSeriesOptions {
	startDate: Date;
	endDate: Date;
	granularity: TimeGranularity;
	modelOrAgent: string;
	isAgent?: boolean;
}
