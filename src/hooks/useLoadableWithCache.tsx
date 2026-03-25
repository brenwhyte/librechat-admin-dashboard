"use client";

import type { Atom } from "jotai";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // 1s, 2s, 4s

type LoadableState<T> =
	| { state: "loading" }
	| { state: "hasData"; data: T }
	| { state: "hasError"; error: unknown };

interface UseLoadableWithCacheOptions {
	/** Called after each backoff delay to trigger a re-fetch of the underlying atom.
	 *  Without this, retry state is tracked but retries are not automatic. */
	onRetry?: () => void;
}

/**
 * Hook that caches the last successful data from a loadable atom
 * to prevent flickering during re-fetches.
 * Only shows loading state on initial load after a delay, not on subsequent refreshes.
 * Also tracks previous data for delta calculation and load count.
 *
 * Supports automatic retry with exponential backoff (1s, 2s, 4s) when an
 * `onRetry` callback is provided. Without it, retry count is still tracked
 * but retries must be triggered externally.
 */
export function useLoadableWithCache<T>(
	loadableAtom: Atom<LoadableState<T>>,
	options?: UseLoadableWithCacheOptions,
) {
	const atomValue = useAtomValue(loadableAtom);
	const cachedDataRef = useRef<T | null>(null);
	const previousDataRef = useRef<T | null>(null);
	const loadCountRef = useRef(0);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	// Delayed skeleton state to prevent flicker on fast loads
	const [showDelayedSkeleton, setShowDelayedSkeleton] = useState(false);
	const skeletonTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Retry state
	const retryCountRef = useRef(0);
	const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const [isRetrying, setIsRetrying] = useState(false);
	// Keep a stable reference to the latest onRetry so the effect doesn't
	// re-fire when the consumer passes a new inline function each render.
	const onRetryRef = useRef(options?.onRetry);
	onRetryRef.current = options?.onRetry;

	// Update cache when we have new data
	useEffect(() => {
		if (atomValue.state === "hasData") {
			// Clear skeleton timeout if data arrives
			if (skeletonTimeoutRef.current) {
				clearTimeout(skeletonTimeoutRef.current);
				skeletonTimeoutRef.current = null;
			}
			setShowDelayedSkeleton(false);

			// Store previous data before updating cache
			if (cachedDataRef.current !== null) {
				previousDataRef.current = cachedDataRef.current;
			}
			cachedDataRef.current = atomValue.data;
			loadCountRef.current += 1;
			setIsInitialLoad(false);

			// Reset retry state on success
			retryCountRef.current = 0;
			setIsRetrying(false);
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}
		}
	}, [atomValue]);

	// Auto-retry on error with exponential backoff
	useEffect(() => {
		if (
			atomValue.state === "hasError" &&
			retryCountRef.current < MAX_RETRIES &&
			onRetryRef.current
		) {
			const delay = BACKOFF_BASE_MS * 2 ** retryCountRef.current;
			setIsRetrying(true);

			retryTimeoutRef.current = setTimeout(() => {
				retryCountRef.current += 1;
				onRetryRef.current?.();
			}, delay);
		} else if (
			atomValue.state === "hasError" &&
			retryCountRef.current >= MAX_RETRIES
		) {
			// All retries exhausted
			setIsRetrying(false);
		}

		return () => {
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}
		};
	}, [atomValue]);

	// Delay showing skeleton to prevent flicker on fast loads
	useEffect(() => {
		if (
			atomValue.state === "loading" &&
			cachedDataRef.current === null &&
			!showDelayedSkeleton
		) {
			// Only show skeleton after 150ms delay
			skeletonTimeoutRef.current = setTimeout(() => {
				setShowDelayedSkeleton(true);
			}, 150);
		}

		return () => {
			if (skeletonTimeoutRef.current) {
				clearTimeout(skeletonTimeoutRef.current);
			}
		};
	}, [atomValue.state, showDelayedSkeleton]);

	// Return cached data during loading if available
	const getData = (): T | null => {
		if (atomValue.state === "hasData") {
			return atomValue.data;
		}
		// Return cached data during loading/error
		return cachedDataRef.current;
	};

	// Get previous data for delta calculation
	const getPreviousData = (): T | null => {
		return previousDataRef.current;
	};

	const isLoading = atomValue.state === "loading";
	const hasError = atomValue.state === "hasError";
	const error = hasError ? atomValue.error : null;

	// Only show loading skeleton on initial load after delay, not on re-fetches
	const showSkeleton =
		isInitialLoad && showDelayedSkeleton && cachedDataRef.current === null;

	// Show subtle loading indicator for re-fetches
	const isRefetching = !isInitialLoad && isLoading;

	// Check if this is the first successful load (no previous data available for delta)
	const isFirstLoad = loadCountRef.current <= 1;

	return {
		data: getData(),
		previousData: getPreviousData(),
		isLoading,
		isInitialLoad,
		isFirstLoad,
		showSkeleton,
		isRefetching,
		hasError,
		error,
		retryCount: retryCountRef.current,
		isRetrying,
	};
}
