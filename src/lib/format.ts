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
  const closed = !marketStatus || !/장중|open/i.test(marketStatus);
  return closed ? `${stamp} 종가 기준` : `${stamp} 장중`;
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
  return title.replace(/^\[.*?\]\s*/g, "").replace(/\s+/g, " ").trim();
}
