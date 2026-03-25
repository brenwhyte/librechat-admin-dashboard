import { NextResponse } from "next/server";
import { withCache } from "@/lib/api/cache";
import { getModelsAndAgents } from "@/lib/db/repositories";

export async function GET() {
	try {
		const data = await withCache("all-models-and-agents", () =>
			getModelsAndAgents(),
		);
		return NextResponse.json(data);
	} catch (e) {
		console.error("Error in all-models-and-agents API:", e);
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}
