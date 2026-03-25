/**
 * Tests for Model Statistics Repository
 *
 * Tests the two-phase query approach:
 * 1. Pre-group transactions via aggregate
 * 2. Batch-fetch conversations/agents via find
 * 3. In-memory join
 */

import type { Collection } from "mongodb";

// Create mock implementations
const mockToArray = jest.fn();
const mockAggregate = jest.fn().mockReturnValue({ toArray: mockToArray });
const mockFind = jest.fn().mockReturnValue({ toArray: jest.fn() });

const mockCollection: Partial<Collection> = {
	aggregate: mockAggregate,
	find: mockFind as unknown as Collection["find"],
};

// Mock the connection module
jest.mock("../../connection", () => ({
	getCollection: jest
		.fn()
		.mockImplementation(() => Promise.resolve(mockCollection)),
	Collections: {
		MESSAGES: "messages",
		USERS: "users",
		AGENTS: "agents",
		CONVERSATIONS: "conversations",
		TRANSACTIONS: "transactions",
	},
	QUERY_MAX_TIME_MS: 60000,
}));

import {
	getModelStatsTable,
	getModelsAndAgents,
	getModelTimeSeries,
	getModelUsageByProvider,
} from "../model-stats.repository";

describe("Model Stats Repository", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		// Default: find returns empty array (for conversation/agent lookups)
		mockFind.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
	});

	describe("getModelsAndAgents", () => {
		it("should return models grouped by endpoint", async () => {
			const mockResult = [
				{
					_id: "openAI",
					models: [
						{ model: "gpt-4", firstCreatedAt: new Date("2024-01-01") },
						{ model: "gpt-3.5-turbo", firstCreatedAt: new Date("2024-01-05") },
					],
				},
				{
					_id: "agents",
					models: [
						{
							model: "agent-1",
							firstCreatedAt: new Date("2024-01-10"),
							agentName: ["Assistant"],
						},
					],
				},
			];
			mockToArray.mockResolvedValueOnce(mockResult);

			const result = await getModelsAndAgents();

			expect(result).toHaveLength(2);
			expect(result[0]._id).toBe("openAI");
			expect(result[0].models).toHaveLength(2);
		});

		it("should filter out null models", async () => {
			mockToArray.mockResolvedValueOnce([]);

			await getModelsAndAgents();

			const pipeline = mockAggregate.mock.calls[0][0];
			const matchStage = pipeline[0].$match;

			expect(matchStage.model).toEqual({ $ne: null });
		});

		it("should include agentName only for agents endpoint", async () => {
			mockToArray.mockResolvedValueOnce([]);

			await getModelsAndAgents();

			const pipeline = mockAggregate.mock.calls[0][0];

			// Find the $group stage that creates models array
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) =>
					"$group" in stage && (stage.$group as Record<string, unknown>).models,
			);

			expect(groupStage).toBeDefined();
		});
	});

	describe("getModelUsageByProvider", () => {
		it("should return empty array when no transactions found", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			};

			const result = await getModelUsageByProvider(params);

			expect(result).toHaveLength(0);
		});

		it("should apply date filter and model filter in pre-group pipeline", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const startDate = new Date("2024-02-01");
			const endDate = new Date("2024-02-29");

			await getModelUsageByProvider({ startDate, endDate });

			const pipeline = mockAggregate.mock.calls[0][0];
			const matchStage = pipeline[0].$match;

			expect(matchStage.createdAt.$gte).toEqual(startDate);
			expect(matchStage.createdAt.$lte).toEqual(endDate);
			expect(matchStage.model).toEqual({ $ne: null });
		});

		it("should use $abs for rawAmount in pre-group stage", async () => {
			mockToArray.mockResolvedValueOnce([]);

			await getModelUsageByProvider({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) => "$group" in stage,
			);

			expect(groupStage).toBeDefined();
			expect(JSON.stringify(groupStage.$group.tokenCount)).toContain("$abs");
		});

		it("should resolve endpoint and model from conversations and agents", async () => {
			// Phase 1: Pre-grouped transactions
			mockToArray.mockResolvedValueOnce([
				{
					_id: { conversationId: "conv-1", model: "gpt-4" },
					tokenCount: 1000,
				},
				{
					_id: { conversationId: "conv-2", model: "agent-model-id" },
					tokenCount: 2000,
				},
			]);

			// Phase 2: Conversation lookup
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			// First call: getConversationMap
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", endpoint: "openAI" },
				{ conversationId: "conv-2", endpoint: "agents", agent_id: "agent-1" },
			]);
			// Second call: getAgentMap
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-1",
					name: "Research Agent",
					model: "claude-3",
					provider: "anthropic",
				},
			]);

			const result = await getModelUsageByProvider({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			// Should group by resolved endpoint and model
			expect(result.length).toBeGreaterThanOrEqual(1);
			const endpoints = result.map((r) => r._id);
			expect(endpoints).toContain("openAI");
		});
	});

	describe("getModelStatsTable", () => {
		it("should return empty array when no transactions found", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			};

			const result = await getModelStatsTable(params);

			expect(result).toHaveLength(0);
		});

		it("should use transactions collection for accurate token stats", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			};

			await getModelStatsTable(params);

			const pipeline = mockAggregate.mock.calls[0][0];
			const matchStage = pipeline[0].$match;

			// Should filter by date and require non-null model
			expect(matchStage.createdAt.$gte).toEqual(params.startDate);
			expect(matchStage.model).toEqual({ $ne: null });
		});

		it("should use $abs for token amounts (LibreChat compatibility)", async () => {
			mockToArray.mockResolvedValueOnce([]);

			await getModelStatsTable({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) => "$group" in stage,
			);

			expect(groupStage).toBeDefined();
			expect(JSON.stringify(groupStage.$group.totalAmount)).toContain("$abs");
		});

		it("should correctly split input/output tokens and count requests", async () => {
			// Pre-grouped transactions with tokenType split
			mockToArray.mockResolvedValueOnce([
				{
					_id: {
						conversationId: "conv-1",
						model: "gpt-4",
						tokenType: "prompt",
					},
					totalAmount: 5000,
					count: 10,
				},
				{
					_id: {
						conversationId: "conv-1",
						model: "gpt-4",
						tokenType: "completion",
					},
					totalAmount: 15000,
					count: 10,
				},
			]);

			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", endpoint: "openAI" },
			]);

			const result = await getModelStatsTable({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			expect(result).toHaveLength(1);
			expect(result[0].model).toBe("gpt-4");
			expect(result[0].endpoint).toBe("openAI");
			expect(result[0].totalInputToken).toBe(5000);
			expect(result[0].totalOutputToken).toBe(15000);
			expect(result[0].requests).toBe(10);
		});
	});

	describe("getModelTimeSeries", () => {
		it("should return empty array when no transactions found", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				model: "gpt-4",
				granularity: "day" as const,
			};

			const result = await getModelTimeSeries(params);

			expect(result).toHaveLength(0);
		});

		it("should filter by specific model", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				model: "gpt-4-turbo",
				granularity: "hour" as const,
			};

			await getModelTimeSeries(params);

			const pipeline = mockAggregate.mock.calls[0][0];
			const matchStage = pipeline[0].$match;

			expect(matchStage.model).toBe("gpt-4-turbo");
		});

		it("should use correct date format for hourly granularity in group stage", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-16"),
				model: "gpt-4",
				granularity: "hour" as const,
			};

			await getModelTimeSeries(params);

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) => "$group" in stage,
			);

			// The date format is now in the $group stage's _id field
			expect(groupStage).toBeDefined();
			const hourField = groupStage.$group._id.hour;
			expect(hourField.$dateToString.format).toBe("%d, %H:00");
		});

		it("should use correct date format for monthly granularity in group stage", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-12-31"),
				model: "gpt-4",
				granularity: "month" as const,
			};

			await getModelTimeSeries(params);

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) => "$group" in stage,
			);

			expect(groupStage).toBeDefined();
			const monthField = groupStage.$group._id.month;
			expect(monthField.$dateToString.format).toBe("%Y-%m");
		});

		it("should apply timezone for date formatting", async () => {
			mockToArray.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				model: "gpt-4",
				granularity: "day" as const,
				timezone: "Europe/Berlin",
			};

			await getModelTimeSeries(params);

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) => "$group" in stage,
			);

			const dayField = groupStage.$group._id.day;
			expect(dayField.$dateToString.timezone).toBe("Europe/Berlin");
		});

		it("should sort results by time bucket", async () => {
			// Pre-grouped data in unsorted order
			mockToArray.mockResolvedValueOnce([
				{
					_id: {
						conversationId: "conv-1",
						tokenType: "completion",
						day: "2024-01-20",
					},
					totalAmount: 200,
					count: 1,
				},
				{
					_id: {
						conversationId: "conv-1",
						tokenType: "completion",
						day: "2024-01-10",
					},
					totalAmount: 100,
					count: 1,
				},
			]);

			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", endpoint: "openAI" },
			]);

			const result = await getModelTimeSeries({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				model: "gpt-4",
				granularity: "day",
			});

			expect(result.length).toBe(2);
			// Should be sorted by day ascending
			expect(result[0].day).toBe("2024-01-10");
			expect(result[1].day).toBe("2024-01-20");
		});
	});
});
