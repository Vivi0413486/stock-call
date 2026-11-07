import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/phoenix";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 30) ?? "";
  if (q.length < 1) return NextResponse.json({ hits: [] });
  try {
    const hits = await searchSymbols(q);
    return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/search]", e instanceof Error ? e.message : e);
    return NextResponse.json({ hits: [], error: "검색 실패" }, { status: 502 });
  }
}
