import { NextResponse } from "next/server";
import { getStockBrief } from "@/lib/phoenix";
import { QUICK_PICKS } from "@/lib/stocks";

/** 종목 한 건의 통화 재료. 키가 없으면 샘플, 일부 실패하면 있는 것만 */
export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const code = symbol.toUpperCase().replace(/^A/, "");
  if (!/^[0-9A-Z]{6}$/.test(code)) {
    return NextResponse.json({ error: "KRX 6자리 종목코드가 필요합니다" }, { status: 400 });
  }
  const nameHint = new URL(req.url).searchParams.get("name")?.slice(0, 40) ?? null;
  try {
    const brief = await getStockBrief(code);
    // 시세 실패로 이름을 못 받았으면 검색 결과·빠른 선택 목록의 이름을 쓴다
    if (brief.name === code) {
      brief.name = QUICK_PICKS.find((p) => p.symbol === code)?.name ?? nameHint ?? code;
    }
    return NextResponse.json(brief, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/stock]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "종목 데이터를 가져오지 못했습니다" }, { status: 502 });
  }
}
