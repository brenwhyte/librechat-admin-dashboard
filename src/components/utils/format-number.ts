/**
 * Number formatting utilities for dashboard display
 *
 * Formats large numbers with English abbreviations:
 * - K for thousands
 * - M for millions
 * - B for billions
 */

export interface FormattedNumber {
	/** Short formatted string (e.g., "1.23M") */
	short: string;
	/** Full number for tooltip (e.g., "1,234,567") */
	full: string;
	/** Raw numeric value */
	value: number;
}

/**
 * Format a number with English abbreviations for display
 *
 * @param value - The number to format
 * @param maxDecimals - Maximum decimal places for short format (default: 2)
 * @returns Object with short, full, and raw value
 */
export function formatLargeNumber(
	value: number | null | undefined,
	maxDecimals = 2,
): FormattedNumber {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return {
			short: "--",
			full: "--",
			value: 0,
		};
	}

	const absValue = Math.abs(value);
	const sign = value < 0 ? "-" : "";

	// Full formatted number with English locale
	const full = value.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	});

	// Short format with abbreviations
	let short: string;

	if (absValue >= 1_000_000_000) {
		// Billions
		const formatted = (absValue / 1_000_000_000).toLocaleString("en-US", {
			minimumFractionDigits: 0,
			maximumFractionDigits: maxDecimals,
		});
		short = `${sign}${formatted}B`;
	} else if (absValue >= 1_000_000) {
		// Millions
		const formatted = (absValue / 1_000_000).toLocaleString("en-US", {
			minimumFractionDigits: 0,
			maximumFractionDigits: maxDecimals,
		});
		short = `${sign}${formatted}M`;
	} else if (absValue >= 1_000) {
		// Thousands
		const formatted = (absValue / 1_000).toLocaleString("en-US", {
			minimumFractionDigits: 0,
			maximumFractionDigits: maxDecimals,
		});
		short = `${sign}${formatted}K`;
	} else {
		// No abbreviation needed
		short = value.toLocaleString("en-US", {
			minimumFractionDigits: 0,
			maximumFractionDigits: maxDecimals,
		});
	}

	return {
		short,
		full,
		value,
	};
}

/**
 * Format a trend value (delta) with abbreviations
 * Includes + sign for positive values
 */
export function formatTrendValue(
	value: number | null | undefined,
	maxDecimals = 2,
): FormattedNumber {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return {
			short: "--",
			full: "--",
			value: 0,
		};
	}

	const formatted = formatLargeNumber(Math.abs(value), maxDecimals);
	const sign = value > 0 ? "+" : value < 0 ? "-" : "";

	return {
		short: value === 0 ? "0" : `${sign}${formatted.short}`,
		full: value === 0 ? "0" : `${sign}${formatted.full}`,
		value,
	};
}
