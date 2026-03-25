/**
 * Tests for Agent Statistics Repository
 *
 * Tests the flipped query direction:
 * 1. Find agent conversations first (via find)
 * 2. Query transactions ONLY for those conversationIds
 * 3. Batch-fetch agent metadata, join in JS
 */

import type { Collection } from "mongodb";

// Create mock implementations
const mockToArray = jest.fn();
const mockAggregate = jest.fn().mockReturnValue({ toArray: mockToArray });
const mockCountDocuments = jest.fn();
const mockFind = jest.fn().mockReturnValue({ toArray: jest.fn() });

const mockCollection: Partial<Collection> = {
	aggregate: mockAggregate,
	countDocuments: mockCountDocuments,
	find: mockFind as unknown as Collection["find"],
};

// Mock the connection module
jest.mock("../../connection", () => ({
	getCollection: jest
		.fn()
		.mockImplementation(() => Promise.resolve(mockCollection)),
	Collections: {
		TRANSACTIONS: "transactions",
		CONVERSATIONS: "conversations",
		AGENTS: "agents",
	},
	QUERY_MAX_TIME_MS: 60000,
}));

import {
	getAgentStatsTable,
	getAgentTimeSeries,
	getTotalAgentCount,
} from "../agent-stats.repository";

describe("Agent Stats Repository", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFind.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
	});

	describe("getTotalAgentCount", () => {
		it("should return the total count of agents", async () => {
			mockCountDocuments.mockResolvedValueOnce(15);

			const result = await getTotalAgentCount();

			expect(result).toBe(15);
			expect(mockCountDocuments).toHaveBeenCalled();
		});

		it("should return 0 when no agents exist", async () => {
			mockCountDocuments.mockResolvedValueOnce(0);

			const result = await getTotalAgentCount();

			expect(result).toBe(0);
		});
	});

	describe("getAgentStatsTable", () => {
		it("should return empty array when no agent conversations exist", async () => {
			// getAgentConversationIds returns empty
			const findToArray = jest.fn().mockResolvedValue([]);
			mockFind.mockReturnValue({ toArray: findToArray });

			const result = await getAgentStatsTable({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			expect(result).toHaveLength(0);
		});

		it("should query conversations with endpoint agents filter", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			// First call: getAgentConversationIds finds agent convos
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
			]);
			// Second call: getAgentMap
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-1",
					name: "Test Agent",
					model: "gpt-4",
					provider: "openAI",
				},
			]);
			// Pre-group returns empty
			mockToArray.mockResolvedValueOnce([]);

			await getAgentStatsTable({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			// First find call should filter by endpoint: "agents"
			expect(mockFind).toHaveBeenCalled();
			const firstFindCall = mockFind.mock.calls[0];
			expect(firstFindCall[0]).toEqual({ endpoint: "agents" });
		});

		it("should apply date filter and conversationId filter to transactions", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
				{ conversationId: "conv-2", agent_id: "agent-2" },
			]);

			mockToArray.mockResolvedValueOnce([]);

			const startDate = new Date("2024-02-01");
			const endDate = new Date("2024-02-29");

			await getAgentStatsTable({ startDate, endDate });

			// Verify the aggregate pipeline filters by date AND conversationId $in
			const pipeline = mockAggregate.mock.calls[0][0];
			const matchStage = pipeline[0].$match;

			expect(matchStage.createdAt.$gte).toEqual(startDate);
			expect(matchStage.createdAt.$lte).toEqual(endDate);
			expect(matchStage.conversationId.$in).toEqual(
				expect.arrayContaining(["conv-1", "conv-2"]),
			);
		});

		it("should use $abs for token amounts (LibreChat compatibility)", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
			]);

			mockToArray.mockResolvedValueOnce([]);

			await getAgentStatsTable({
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

		it("should correctly join agent metadata and split tokens", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			// getAgentConversationIds
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
			]);

			// Pre-grouped transactions
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

			// getAgentMap
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-1",
					name: "Research Assistant",
					model: "claude-3",
					provider: "anthropic",
				},
			]);

			const result = await getAgentStatsTable({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			expect(result).toHaveLength(1);
			expect(result[0].agentName).toBe("Research Assistant");
			expect(result[0].model).toBe("claude-3");
			expect(result[0].endpoint).toBe("anthropic");
			expect(result[0].totalInputToken).toBe(5000);
			expect(result[0].totalOutputToken).toBe(15000);
			expect(result[0].requests).toBe(10);
		});

		it("should fall back to agent_id when agent not found", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-123" },
			]);

			mockToArray.mockResolvedValueOnce([
				{
					_id: {
						conversationId: "conv-1",
						model: "gpt-4",
						tokenType: "completion",
					},
					totalAmount: 1000,
					count: 5,
				},
			]);

			// Agent not found
			findToArray.mockResolvedValueOnce([]);

			const result = await getAgentStatsTable({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			expect(result[0].agentName).toBe("agent-123");
		});
	});

	describe("getAgentTimeSeries", () => {
		it("should return empty array when no agent conversations exist", async () => {
			const findToArray = jest.fn().mockResolvedValue([]);
			mockFind.mockReturnValue({ toArray: findToArray });

			const result = await getAgentTimeSeries({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				agentName: "Test Agent",
				granularity: "day",
			});

			expect(result).toHaveLength(0);
		});

		it("should filter transactions to only the target agent's conversations", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });

			// getAgentConversationIds - multiple agents
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
				{ conversationId: "conv-2", agent_id: "agent-1" },
				{ conversationId: "conv-3", agent_id: "agent-2" },
			]);

			// getAgentMap
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-1",
					name: "Target Agent",
					model: "gpt-4",
					provider: "openAI",
				},
				{
					id: "agent-2",
					name: "Other Agent",
					model: "claude-3",
					provider: "anthropic",
				},
			]);

			mockToArray.mockResolvedValueOnce([]);

			await getAgentTimeSeries({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				agentName: "Target Agent",
				granularity: "day",
			});

			// Should only query transactions for conv-1 and conv-2 (agent-1's convos)
			const pipeline = mockAggregate.mock.calls[0][0];
			const matchStage = pipeline[0].$match;
			expect(matchStage.conversationId.$in).toEqual(
				expect.arrayContaining(["conv-1", "conv-2"]),
			);
			expect(matchStage.conversationId.$in).not.toContain("conv-3");
		});

		it("should use correct date format for daily granularity", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
			]);
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-1",
					name: "Test Agent",
					model: "gpt-4",
					provider: "openAI",
				},
			]);

			mockToArray.mockResolvedValueOnce([]);

			await getAgentTimeSeries({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				agentName: "Test Agent",
				granularity: "day",
			});

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) => "$group" in stage,
			);

			expect(groupStage).toBeDefined();
			const dayField = groupStage.$group._id.day;
			expect(dayField.$dateToString.format).toBe("%Y-%m-%d");
		});

		it("should apply timezone for date formatting", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
			]);
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-1",
					name: "Test Agent",
					model: "gpt-4",
					provider: "openAI",
				},
			]);

			mockToArray.mockResolvedValueOnce([]);

			await getAgentTimeSeries({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				agentName: "Test Agent",
				granularity: "day",
				timezone: "Europe/Berlin",
			});

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) => "$group" in stage,
			);

			const dayField = groupStage.$group._id.day;
			expect(dayField.$dateToString.timezone).toBe("Europe/Berlin");
		});

		it("should default timezone to UTC", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
			]);
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-1",
					name: "Test Agent",
					model: "gpt-4",
					provider: "openAI",
				},
			]);

			mockToArray.mockResolvedValueOnce([]);

			await getAgentTimeSeries({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				agentName: "Test Agent",
				granularity: "day",
			});

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline.find(
				(stage: Record<string, unknown>) => "$group" in stage,
			);

			const dayField = groupStage.$group._id.day;
			expect(dayField.$dateToString.timezone).toBe("UTC");
		});

		it("should sort results by time bucket ascending", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-1" },
			]);
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-1",
					name: "Test Agent",
					model: "gpt-4",
					provider: "openAI",
				},
			]);

			// Pre-grouped data in unsorted order
			mockToArray.mockResolvedValueOnce([
				{
					_id: { tokenType: "completion", day: "2024-01-20" },
					totalAmount: 200,
					count: 1,
				},
				{
					_id: { tokenType: "completion", day: "2024-01-10" },
					totalAmount: 100,
					count: 1,
				},
			]);

			const result = await getAgentTimeSeries({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				agentName: "Test Agent",
				granularity: "day",
			});

			expect(result.length).toBe(2);
			expect(result[0].day).toBe("2024-01-10");
			expect(result[1].day).toBe("2024-01-20");
		});

		it("should match by agent_id when agent name doesnt match", async () => {
			const findToArray = jest.fn();
			mockFind.mockReturnValue({ toArray: findToArray });
			findToArray.mockResolvedValueOnce([
				{ conversationId: "conv-1", agent_id: "agent-id-123" },
			]);
			findToArray.mockResolvedValueOnce([
				{
					id: "agent-id-123",
					name: "Different Name",
					model: "gpt-4",
					provider: "openAI",
				},
			]);

			mockToArray.mockResolvedValueOnce([]);

			// Searching by agent_id directly
			const result = await getAgentTimeSeries({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				agentName: "agent-id-123",
				granularity: "day",
			});

			// Should find the agent by ID match
			expect(result).toHaveLength(0); // No transactions, but should not error
		});
	});
});
