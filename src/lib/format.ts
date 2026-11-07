/** 화면·프롬프트 공용 포맷터 */

export function fmtKrw(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** ISO 시각 → "11/6 15:30 종가 기준" 같은 한국 시간 표기. 장이 닫혔으면 종가 기준으로 쓴다 */
export function fmtAsOf(iso: string, marketStatus: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "기준 시각 미상";
  const kst = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => kst.find((p) => p.type === t)?.value ?? "";
  const stamp = `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
  return isMarketClosed(marketStatus) ? `${stamp} 종가 기준` : `${stamp} 장중 시세 (실시간 아님)`;
}

/**
 * Phoenix market_status: 주말·휴일·08~20시 밖은 "CLOSED", 거래정지는 "HALTED"(openapi.json 설명).
 * 장중 값은 제공자 세션 문자열이라 열거되어 있지 않다 → 닫힘이 확실한 경우만 종가로, 모르면 장중으로 보지 않고 종가로 둔다
 */
export function isMarketClosed(marketStatus: string | null | undefined): boolean {
  if (!marketStatus) return true;
  return /closed|halt|장마감|휴장/i.test(marketStatus);
}

/** "2026-11-05" → "11월 5일" */
export function fmtDateKo(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

/** 억원 단위 값을 말로: 123456 억원 → "12조 3456억원" */
export function fmtEok(value: number, unit: string): string {
  if (unit !== "억원") return `${value.toLocaleString("ko-KR")}${unit}`;
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(Math.round(value));
  const jo = Math.floor(v / 10000);
  const eok = v % 10000;
  if (jo > 0) return `${sign}${jo}조 ${eok > 0 ? `${eok.toLocaleString("ko-KR")}억원` : ""}`.trim();
  return `${sign}${eok.toLocaleString("ko-KR")}억원`;
}

/** 공시 제목에서 캐릭터가 읽기 좋게 군더더기를 뺀다 */
export function tidyTitle(title: string): string {
  // 가운뎃점(ㆍ·)은 TTS가 엉뚱하게 읽으므로 공백으로 (실측: "임원ㆍ주요주주" → "임원우주요 주주")
  return title.replace(/^\[.*?\]\s*/g, "").replace(/[ㆍ·]/g, " ").replace(/\s+/g, " ").trim();
}
