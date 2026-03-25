"use client";

import { Box, CircularProgress } from "@mui/material";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/utils/api-base";

interface AuthGuardProps {
	children: React.ReactNode;
}

// Public routes that don't require authentication
const PUBLIC_ROUTES = ["/login"];

export default function AuthGuard({ children }: AuthGuardProps) {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
	const [isClient, setIsClient] = useState(false);
	const router = useRouter();
	const pathname = usePathname();
	const isRedirecting = useRef(false);

	const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

	// Hydration guard: render nothing on the server, only show UI on the client
	useEffect(() => {
		setIsClient(true);
	}, []);

	// Reset redirecting flag when pathname changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is intentionally used as trigger
	useEffect(() => {
		isRedirecting.current = false;
	}, [pathname]);

	// Check authentication status on mount
	useEffect(() => {
		const checkAuth = async () => {
			try {
				const response = await fetch(`${API_BASE}/auth/verify`, {
					method: "POST",
					credentials: "include",
				});
				setIsAuthenticated(response.ok);
			} catch {
				setIsAuthenticated(false);
			}
		};
		checkAuth();
	}, []);

	// Handle redirects based on auth state
	useEffect(() => {
		if (isAuthenticated === null) return; // Still checking
		if (isRedirecting.current) return; // Already redirecting

		if (!isAuthenticated && !isPublicRoute) {
			// Not authenticated and trying to access protected route
			isRedirecting.current = true;
			router.replace("/login");
		} else if (isAuthenticated && isPublicRoute) {
			// Authenticated but on login page, redirect to dashboard
			isRedirecting.current = true;
			router.replace("/dashboard");
		}
	}, [isAuthenticated, isPublicRoute, router]);

	// Server-side and initial client render: render nothing to avoid hydration mismatch
	// (MUI's useColorScheme mode is undefined on server but resolved on client)
	if (!isClient || isAuthenticated === null) {
		return null;
	}

	// Show loading while redirecting
	if (
		(!isAuthenticated && !isPublicRoute) ||
		(isAuthenticated && isPublicRoute)
	) {
		return (
			<Box
				sx={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					minHeight: "100vh",
				}}
			>
				<CircularProgress />
			</Box>
		);
	}

	// Render children (either authenticated on protected route, or public route)
	return <>{children}</>;
}
