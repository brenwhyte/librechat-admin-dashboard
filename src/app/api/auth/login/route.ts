import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Default password for local development, can be overridden via environment variable
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin";
const SESSION_SECRET =
	process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const SESSION_COOKIE_NAME = "dashboard_session";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Generate HMAC-based session token
function generateSessionToken(timestamp: number): string {
	const hmac = createHmac("sha256", SESSION_SECRET);
	hmac.update(`${timestamp}`);
	return `${timestamp}.${hmac.digest("hex")}`;
}

// Verify session token
function verifySessionToken(token: string): boolean {
	const parts = token.split(".");
	if (parts.length !== 2) {
		return false;
	}

	const [timestampStr, signature] = parts;
	const timestamp = Number.parseInt(timestampStr, 10);

	if (Number.isNaN(timestamp)) {
		return false;
	}

	// Check if session has expired
	if (Date.now() - timestamp > SESSION_DURATION) {
		return false;
	}

	// Verify signature
	const expectedToken = generateSessionToken(timestamp);
	const expectedSignature = expectedToken.split(".")[1];

	try {
		return timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature),
		);
	} catch {
		return false;
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { password } = body;

		if (!password || typeof password !== "string") {
			return NextResponse.json(
				{ error: "Password is required" },
				{ status: 400 },
			);
		}

		// Timing-safe password comparison
		const passwordBuffer = Buffer.from(password);
		const expectedBuffer = Buffer.from(DASHBOARD_PASSWORD);

		let passwordMatch = false;
		if (passwordBuffer.length === expectedBuffer.length) {
			passwordMatch = timingSafeEqual(passwordBuffer, expectedBuffer);
		} else {
			// Perform comparison anyway to prevent timing attacks
			timingSafeEqual(passwordBuffer, passwordBuffer);
		}

		if (!passwordMatch) {
			// Add delay to prevent brute force attacks
			await new Promise((resolve) =>
				setTimeout(resolve, 1000 + Math.random() * 500),
			);
			return NextResponse.json({ error: "Invalid password" }, { status: 401 });
		}

		// Generate session token
		const sessionToken = generateSessionToken(Date.now());

		// Create response with HTTP-only cookie
		const response = NextResponse.json({ success: true });

		response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
			httpOnly: true, // Prevents JavaScript access (XSS protection)
			secure: process.env.NODE_ENV === "production", // HTTPS only in production
			sameSite: "strict", // CSRF protection
			path: "/",
			maxAge: SESSION_DURATION / 1000, // Convert to seconds
		});

		return response;
	} catch (error) {
		console.error("Login error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export { SESSION_COOKIE_NAME, verifySessionToken };
