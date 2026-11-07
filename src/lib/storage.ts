import type { Honorific } from "./prompt";
import type { Position } from "./mood";
import type { StockBrief } from "./schema";

/** 브라우저 localStorage 전용. 평단·수량·통화 기록은 서버로 보내지 않는다 */

const KEY_HONORIFIC = "stockcall.honorific";
const KEY_POSITIONS = "stockcall.positions";
const KEY_HISTORY = "stockcall.history";

export type Line = { role: "assistant" | "user"; text: string };

export type CallRecord = {
  id: string;
  symbol: string;
  name: string;
  emoji: string;
  color: string;
  startedAt: string; // ISO
  durationSec: number;
  mood: string;
  moodEmoji: string;
  honorific: Honorific;
  lines: Line[];
  brief: StockBrief;
  pnlPct: number | null;
  mode: "voice" | "listen";
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가(사생활 모드 등)여도 앱은 동작해야 한다 */
  }
}

export function loadHonorific(): Honorific {
  const v = read<string>(KEY_HONORIFIC, "형");
  return (["형", "누나", "언니", "오빠"] as const).includes(v as Honorific) ? (v as Honorific) : "형";
}
export function saveHonorific(h: Honorific) {
  write(KEY_HONORIFIC, h);
}

export function loadPosition(symbol: string): Position | null {
  const all = read<Record<string, Position>>(KEY_POSITIONS, {});
  const p = all[symbol];
  return p && p.avgPrice > 0 && p.quantity > 0 ? p : null;
}
export function savePosition(symbol: string, pos: Position | null) {
  const all = read<Record<string, Position>>(KEY_POSITIONS, {});
  if (pos) all[symbol] = pos;
  else delete all[symbol];
  write(KEY_POSITIONS, all);
}

export function loadHistory(): CallRecord[] {
  return read<CallRecord[]>(KEY_HISTORY, []);
}
export function pushHistory(rec: CallRecord) {
  const all = [rec, ...loadHistory()].slice(0, 20);
  write(KEY_HISTORY, all);
}
