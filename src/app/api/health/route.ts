import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/phoenix";

/** 키 존재 여부와 연결 상태만. 키 값은 절대 내보내지 않는다 */
export async function GET() {
  const health = await checkHealth();
  const vapi = Boolean(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY?.trim());
  return NextResponse.json({ ...health, vapi }, { headers: { "Cache-Control": "no-store" } });
}
