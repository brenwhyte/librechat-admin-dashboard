import { NextResponse } from "next/server";
import { withCache } from "@/lib/api/cache";
import { getTotalAgentCount } from "@/lib/db/repositories";

export async function GET() {
	try {
		const count = await withCache("all-agents", () => getTotalAgentCount());
		return NextResponse.json([{ totalAgentsCount: count }]);
	} catch (e) {
		console.error("Error in all-agents API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
