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
  // 검색 결과에서 온 이름 힌트. 프롬프트에 들어가므로 따옴표·개행·길이를 정리한다
  const nameHint = new URL(req.url).searchParams.get("name")?.replace(/[\r\n"'`\\]/g, "").trim().slice(0, 40) || null;
  try {
    const cachedBrief = await getStockBrief(code);
    // 시세 실패로 이름을 못 받았으면 빠른 선택 목록·검색 결과의 이름을 쓴다. 캐시 객체는 수정하지 않는다
    const name = cachedBrief.name === code ? (QUICK_PICKS.find((p) => p.symbol === code)?.name ?? nameHint ?? code) : cachedBrief.name;
    const brief = { ...cachedBrief, name };
    return NextResponse.json(brief, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/stock]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "종목 데이터를 가져오지 못했습니다" }, { status: 502 });
  }
}
