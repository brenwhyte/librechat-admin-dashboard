/**
 * Tests for File Statistics Repository
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
		FILES: "files",
	},
}));

import { getFilesProcessedStats } from "../file-stats.repository";

describe("File Stats Repository", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("getFilesProcessedStats", () => {
		it("should return files processed counts for current and previous period", async () => {
			// Two separate aggregate calls: current count, then prev count
			mockToArray
				.mockResolvedValueOnce([{ total: 100 }])
				.mockResolvedValueOnce([{ total: 80 }]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getFilesProcessedStats(params);

			expect(result).toHaveLength(1);
			expect(result[0].currentInputToken).toBe(100);
			expect(result[0].prevInputToken).toBe(80);
			expect(result[0].currentOutputToken).toBe(0);
			expect(result[0].prevOutputToken).toBe(0);
			expect(mockAggregate).toHaveBeenCalledTimes(2);
		});

		it("should handle empty periods returning zero counts", async () => {
			mockToArray.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

			const params = {
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			};

			const result = await getFilesProcessedStats(params);

			expect(result[0].currentInputToken).toBe(0);
			expect(result[0].prevInputToken).toBe(0);
		});

		it("should use correct date filters for each period", async () => {
			mockToArray.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

			const startDate = new Date("2024-02-01");
			const endDate = new Date("2024-02-29");
			const prevStart = new Date("2024-01-01");
			const prevEnd = new Date("2024-02-01");

			await getFilesProcessedStats({ startDate, endDate, prevStart, prevEnd });

			expect(mockAggregate).toHaveBeenCalledTimes(2);

			// First call = current period
			const currentPipeline = mockAggregate.mock.calls[0][0];
			const currentMatch = currentPipeline[0].$match;
			expect(currentMatch.createdAt.$gte).toEqual(startDate);
			expect(currentMatch.createdAt.$lte).toEqual(endDate);

			// Second call = previous period
			const prevPipeline = mockAggregate.mock.calls[1][0];
			const prevMatch = prevPipeline[0].$match;
			expect(prevMatch.createdAt.$gte).toEqual(prevStart);
			expect(prevMatch.createdAt.$lte).toEqual(prevEnd);
		});

		it("should use $count stage to count documents", async () => {
			mockToArray.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

			await getFilesProcessedStats({
				startDate: new Date("2024-01-15"),
				endDate: new Date("2024-01-31"),
				prevStart: new Date("2024-01-01"),
				prevEnd: new Date("2024-01-15"),
			});

			// Both pipelines should end with $count: "total"
			const currentPipeline = mockAggregate.mock.calls[0][0];
			const prevPipeline = mockAggregate.mock.calls[1][0];
			expect(currentPipeline[1].$count).toBe("total");
			expect(prevPipeline[1].$count).toBe("total");
		});
	});
});
