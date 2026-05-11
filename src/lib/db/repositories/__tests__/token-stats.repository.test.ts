/**
 * Tests for Token Statistics Repository
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
		TRANSACTIONS: "transactions",
	},
}));

import {
	getMessageStats,
	getRequestHeatmap,
	getTokenCounts,
} from "../token-stats.repository";

describe("Token Stats Repository", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("getTokenCounts", () => {
		it("should return token counts for current and previous periods", async () => {
			// Four separate aggregate calls:
			// 1. current input (prompt), 2. prev input (prompt)
			// 3. current output (completion), 4. prev output (completion)
			mockToArray
				.mockResolvedValueOnce([{ total: 10000 }]) // currentInput
				.mockResolvedValueOnce([{ total: 8000 }])  // prevInput
				.mockResolvedValueOnce([{ total: 50000 }]) // currentOutput
				.mockResolvedValueOnce([{ total: 40000 }]); // prevOutput

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getTokenCounts(params);

			expect(result).toEqual([
				{
					currentInputToken: 10000,
					currentOutputToken: 50000,
					prevInputToken: 8000,
					prevOutputToken: 40000,
				},
			]);
			expect(mockAggregate).toHaveBeenCalledTimes(4);
		});

		it("should use tokenType: prompt for input tokens", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2023-12-01"),
				prevEnd: new Date("2024-01-01"),
			};

			await getTokenCounts(params);

			// Call 0 = current input, call 1 = prev input
			const currentInputMatch = mockAggregate.mock.calls[0][0][0].$match;
			expect(currentInputMatch.tokenType).toBe("prompt");

			const prevInputMatch = mockAggregate.mock.calls[1][0][0].$match;
			expect(prevInputMatch.tokenType).toBe("prompt");
		});

		it("should use tokenType: completion for output tokens", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2023-12-01"),
				prevEnd: new Date("2024-01-01"),
			};

			await getTokenCounts(params);

			// Call 2 = current output, call 3 = prev output
			const currentOutputMatch = mockAggregate.mock.calls[2][0][0].$match;
			expect(currentOutputMatch.tokenType).toBe("completion");

			const prevOutputMatch = mockAggregate.mock.calls[3][0][0].$match;
			expect(prevOutputMatch.tokenType).toBe("completion");
		});

		it("should use $abs of rawAmount for token counts", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			await getTokenCounts({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2023-12-01"),
				prevEnd: new Date("2024-01-01"),
			});

			const currentInputPipeline = mockAggregate.mock.calls[0][0];
			const groupStage = currentInputPipeline[1].$group;
			expect(groupStage.total).toEqual({ $sum: { $abs: "$rawAmount" } });
		});

		it("should return zeros when no transactions exist", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const result = await getTokenCounts({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2023-12-01"),
				prevEnd: new Date("2024-01-01"),
			});

			expect(result[0].currentInputToken).toBe(0);
			expect(result[0].currentOutputToken).toBe(0);
			expect(result[0].prevInputToken).toBe(0);
			expect(result[0].prevOutputToken).toBe(0);
		});
	});

	describe("getMessageStats", () => {
		it("should return message statistics for current and previous period", async () => {
			mockToArray
				.mockResolvedValueOnce([{ totalMessages: 1000, totalTokenCount: 5000, totalSummaryTokenCount: 200 }])
				.mockResolvedValueOnce([{ totalMessages: 800, totalTokenCount: 4000, totalSummaryTokenCount: 150 }]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getMessageStats(params);

			expect(result).toEqual([
				{
					totalMessages: 1000,
					totalTokenCount: 5000,
					totalSummaryTokenCount: 200,
					prevTotalMessages: 800,
					prevTotalTokenCount: 4000,
					prevTotalSummaryTokenCount: 150,
				},
			]);
			expect(mockAggregate).toHaveBeenCalledTimes(2);
		});

		it("should sum totalMessages, totalTokenCount, totalSummaryTokenCount", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			await getMessageStats({
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			});

			const pipeline = mockAggregate.mock.calls[0][0];
			const groupStage = pipeline[1].$group;
			expect(groupStage.totalMessages).toEqual({ $sum: 1 });
			expect(groupStage.totalTokenCount).toEqual({ $sum: "$tokenCount" });
			expect(groupStage.totalSummaryTokenCount).toEqual({ $sum: "$summaryTokenCount" });
		});

		it("should return zeros when no messages exist", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const result = await getMessageStats({
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			});

			expect(result[0].totalMessages).toBe(0);
			expect(result[0].totalTokenCount).toBe(0);
			expect(result[0].prevTotalMessages).toBe(0);
		});
	});

	describe("getRequestHeatmap", () => {
		it("should return heatmap data grouped by day and hour", async () => {
			const mockData = [
				{ dayOfWeek: 1, timeSlot: 9, date: "2024-01-15", totalRequests: 42 },
				{ dayOfWeek: 2, timeSlot: 14, date: "2024-01-16", totalRequests: 28 },
			];
			mockToArray.mockResolvedValueOnce(mockData);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
			};

			const result = await getRequestHeatmap(params);

			expect(result).toEqual(mockData);
		});

		it("should use timezone UTC by default", async () => {
			mockToArray.mockResolvedValueOnce([]);

			await getRequestHeatmap({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			const pipeline = mockAggregate.mock.calls[0][0];
			const projectStage = pipeline[1].$project;
			expect(projectStage.hour.$hour.timezone).toBe("UTC");
		});

		it("should accept custom timezone", async () => {
			mockToArray.mockResolvedValueOnce([]);

			await getRequestHeatmap({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
				timezone: "Europe/Berlin",
			});

			const pipeline = mockAggregate.mock.calls[0][0];
			const projectStage = pipeline[1].$project;
			expect(projectStage.hour.$hour.timezone).toBe("Europe/Berlin");
		});
	});
});
