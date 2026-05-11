/**
 * Tests for Tool Statistics Repository
 *
 * Updated to use parallel aggregations instead of $facet
 * (DocumentDB compatibility fix).
 */

import type { Collection } from "mongodb";

// Create mock implementations
const mockToArray = jest.fn();
const mockAggregate = jest.fn().mockReturnValue({ toArray: mockToArray });

const mockCollection: Partial<Collection> = {
	aggregate: mockAggregate,
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
	},
}));

import {
	getAllToolCalls,
	getMcpToolCalls,
	getMcpToolStatsChart,
	getMcpToolStatsTable,
	getWebSearchStats,
} from "../tool-stats.repository";

describe("Tool Stats Repository", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("getMcpToolCalls", () => {
		it("should return MCP tool call counts for current and previous period", async () => {
			mockToArray
				.mockResolvedValueOnce([{ mcpToolCallCount: 42 }])
				.mockResolvedValueOnce([{ mcpToolCallCount: 30 }]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getMcpToolCalls(params);

			expect(result).toEqual([{ currentMcpToolCalls: 42, prevMcpToolCalls: 30 }]);
			expect(mockAggregate).toHaveBeenCalledTimes(2);
		});

		it("should handle zero MCP tool calls", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getMcpToolCalls(params);

			expect(result[0].currentMcpToolCalls).toBe(0);
			expect(result[0].prevMcpToolCalls).toBe(0);
		});

		it("should filter by tool_call.name MCP delimiter regex", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			await getMcpToolCalls({
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			});

			// Both pipelines should contain a $match on content.tool_call.name with MCP delimiter
			const currentPipeline = mockAggregate.mock.calls[0][0];
			const mcpMatchStage = currentPipeline.find(
				(s: Record<string, unknown>) =>
					s.$match &&
					(s.$match as Record<string, unknown>)["content.tool_call.name"] !== undefined,
			);
			expect(mcpMatchStage).toBeDefined();
		});

		it("should use correct date ranges for each period", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const startDate = new Date("2024-02-01");
			const endDate = new Date("2024-02-29");
			const prevStart = new Date("2024-01-01");
			const prevEnd = new Date("2024-02-01");

			await getMcpToolCalls({ startDate, endDate, prevStart, prevEnd });

			const currentMatch = mockAggregate.mock.calls[0][0][0].$match;
			expect(currentMatch.createdAt.$gte).toEqual(startDate);
			expect(currentMatch.createdAt.$lte).toEqual(endDate);

			const prevMatch = mockAggregate.mock.calls[1][0][0].$match;
			expect(prevMatch.createdAt.$gte).toEqual(prevStart);
			expect(prevMatch.createdAt.$lte).toEqual(prevEnd);
		});
	});

	describe("getAllToolCalls", () => {
		it("should return all tool call counts for current and previous period", async () => {
			mockToArray
				.mockResolvedValueOnce([{ toolCallCount: 100 }])
				.mockResolvedValueOnce([{ toolCallCount: 80 }]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getAllToolCalls(params);

			expect(result).toEqual([{ currentToolCalls: 100, prevToolCalls: 80 }]);
			expect(mockAggregate).toHaveBeenCalledTimes(2);
		});

		it("should handle zero tool calls", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const result = await getAllToolCalls({
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			});

			expect(result[0].currentToolCalls).toBe(0);
			expect(result[0].prevToolCalls).toBe(0);
		});
	});

	describe("getWebSearchStats", () => {
		it("should return web search statistics for current and previous period", async () => {
			mockToArray
				.mockResolvedValueOnce([{ searchCount: 25, uniqueUsers: ["u1", "u2"], uniqueConversations: ["c1"] }])
				.mockResolvedValueOnce([{ searchCount: 15, uniqueUsers: ["u1"], uniqueConversations: ["c1", "c2"] }]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getWebSearchStats(params);

			expect(result.current.searchCount).toBe(25);
			expect(result.current.uniqueUsers).toBe(2);
			expect(result.current.uniqueConversations).toBe(1);
			expect(result.prev.searchCount).toBe(15);
			expect(result.prev.uniqueUsers).toBe(1);
			expect(result.prev.uniqueConversations).toBe(2);
			expect(mockAggregate).toHaveBeenCalledTimes(2);
		});

		it("should return zeros when no web searches exist", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const result = await getWebSearchStats({
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			});

			expect(result.current).toEqual({ searchCount: 0, uniqueUsers: 0, uniqueConversations: 0 });
			expect(result.prev).toEqual({ searchCount: 0, uniqueUsers: 0, uniqueConversations: 0 });
		});

		it("should filter by web_search regex in tool_call.name", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			await getWebSearchStats({
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			});

			const currentPipeline = mockAggregate.mock.calls[0][0];
			const webSearchMatch = currentPipeline.find(
				(s: Record<string, unknown>) =>
					s.$match &&
					(s.$match as Record<string, unknown>)["content.tool_call.name"] !== undefined,
			);
			expect(webSearchMatch.$match["content.tool_call.name"].$regex).toBe("web_search");
		});
	});

	describe("getMcpToolStatsTable", () => {
		it("should return MCP tool statistics grouped by tool and server", async () => {
			const mockData = [
				{
					toolName: "search",
					serverName: "brave",
					callCount: 100,
					uniqueUsers: 5,
					uniqueConversations: 20,
				},
			];
			mockToArray.mockResolvedValueOnce(mockData);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
			};

			const result = await getMcpToolStatsTable(params);

			expect(result).toEqual(mockData);
			expect(mockAggregate).toHaveBeenCalledTimes(1);
		});
	});

	describe("getMcpToolStatsChart", () => {
		it("should return MCP tool time series grouped by tool, server, and date", async () => {
			const mockData = [
				{
					toolName: "search",
					serverName: "brave",
					date: "2024-01-15",
					callCount: 10,
				},
			];
			mockToArray.mockResolvedValueOnce(mockData);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				granularity: "day" as const,
			};

			const result = await getMcpToolStatsChart(params);

			expect(result).toEqual(mockData);
		});
	});
});
