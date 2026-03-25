import { NextResponse } from "next/server";
import { withCache } from "@/lib/api/cache";
import { getTotalUserCount } from "@/lib/db/repositories";

export async function GET() {
	try {
		const count = await withCache("all-user", () => getTotalUserCount());
		return NextResponse.json([{ totalUserCount: count }]);
	} catch (e) {
		console.error("Error in all-user API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
