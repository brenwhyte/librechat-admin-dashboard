/**
 * Tests for User Statistics Repository
 *
 * Updated to use parallel aggregations instead of $facet
 * (DocumentDB compatibility fix).
 */

import type { Collection, Db } from "mongodb";

// Create mock implementations
const mockToArray = jest.fn();
const mockAggregate = jest.fn().mockReturnValue({ toArray: mockToArray });
const mockCountDocuments = jest.fn();

const mockCollection: Partial<Collection> = {
	aggregate: mockAggregate,
	countDocuments: mockCountDocuments,
};

const _mockDb: Partial<Db> = {
	collection: jest.fn().mockReturnValue(mockCollection),
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
	getActiveUsers,
	getConversations,
	getTotalUserCount,
} from "../user-stats.repository";

describe("User Stats Repository", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("getActiveUsers", () => {
		it("should return active user counts for current and previous period", async () => {
			// Two separate aggregate calls: current period, then previous period
			mockToArray
				.mockResolvedValueOnce([{ activeUserCount: 150 }])
				.mockResolvedValueOnce([{ activeUserCount: 120 }]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getActiveUsers(params);

			expect(result).toEqual([{ currentActiveUsers: 150, prevActiveUsers: 120 }]);
			expect(mockAggregate).toHaveBeenCalledTimes(2);
		});

		it("should handle zero active users", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getActiveUsers(params);

			expect(result[0].currentActiveUsers).toBe(0);
			expect(result[0].prevActiveUsers).toBe(0);
		});

		it("should use correct date filters for each period", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const startDate = new Date("2024-02-01");
			const endDate = new Date("2024-02-29");
			const prevStart = new Date("2024-01-03");
			const prevEnd = new Date("2024-02-01");

			await getActiveUsers({ startDate, endDate, prevStart, prevEnd });

			expect(mockAggregate).toHaveBeenCalledTimes(2);

			// First aggregate call = current period
			const currentPipeline = mockAggregate.mock.calls[0][0];
			const currentMatch = currentPipeline[0].$match;
			expect(currentMatch.createdAt.$gte).toEqual(startDate);
			expect(currentMatch.createdAt.$lte).toEqual(endDate);

			// Second aggregate call = previous period
			const prevPipeline = mockAggregate.mock.calls[1][0];
			const prevMatch = prevPipeline[0].$match;
			expect(prevMatch.createdAt.$gte).toEqual(prevStart);
			expect(prevMatch.createdAt.$lte).toEqual(prevEnd);
		});

		it("should group by user field to count unique active users", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			await getActiveUsers({
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			});

			const currentPipeline = mockAggregate.mock.calls[0][0];
			expect(currentPipeline[1].$group._id).toBe("$user");
			expect(currentPipeline[2].$count).toBe("activeUserCount");
		});
	});

	describe("getTotalUserCount", () => {
		it("should return total user count", async () => {
			mockCountDocuments.mockResolvedValueOnce(500);

			const result = await getTotalUserCount();

			expect(result).toBe(500);
			expect(mockCountDocuments).toHaveBeenCalledTimes(1);
		});

		it("should return zero for empty collection", async () => {
			mockCountDocuments.mockResolvedValueOnce(0);

			const result = await getTotalUserCount();

			expect(result).toBe(0);
		});
	});

	describe("getConversations", () => {
		it("should return conversation counts for current and previous period", async () => {
			mockToArray
				.mockResolvedValueOnce([{ conversationCount: 250 }])
				.mockResolvedValueOnce([{ conversationCount: 200 }]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getConversations(params);

			expect(result).toEqual([{ currentConversations: 250, prevConversations: 200 }]);
			expect(mockAggregate).toHaveBeenCalledTimes(2);
		});

		it("should count unique conversationIds using group and count", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			await getConversations(params);

			// First call is current period — pipeline: [$match, $group, $count]
			const currentPipeline = mockAggregate.mock.calls[0][0];
			expect(currentPipeline[1].$group._id).toBe("$conversationId");
			expect(currentPipeline[2].$count).toBe("conversationCount");

			// Second call is previous period
			const prevPipeline = mockAggregate.mock.calls[1][0];
			expect(prevPipeline[1].$group._id).toBe("$conversationId");
			expect(prevPipeline[2].$count).toBe("conversationCount");
		});

		it("should handle zero conversations", async () => {
			mockToArray
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getConversations(params);

			expect(result[0].currentConversations).toBe(0);
			expect(result[0].prevConversations).toBe(0);
		});
	});
});
