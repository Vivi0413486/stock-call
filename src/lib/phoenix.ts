import "server-only";
import {
  DisclosuresResponse,
  FinancialsResponse,
  KeyResponse,
  QuoteResponse,
  SymbolsResponse,
  type StockBrief,
  type SymbolHit,
} from "./schema";
import { toPercent } from "./mood";
import { tidyTitle } from "./format";
import { sampleBrief, sampleSearch } from "./sample";

/**
 * Phoenix AI DATA API 클라이언트. 서버에서만 호출한다 (키가 브라우저로 가지 않는다).
 * - Base URL·헤더·오류 처리는 빌더 킷 examples/javascript/quickstart.mjs 기준
 * - 같은 종목 5분 캐시: 행사 한도(팀당 50,000회·분당 120회)를 아낀다
 */

const BASE = "https://api.chickstockfi.com/openapi/v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
/** 일부 실패한 결과는 짧게만 캐시해 곧 재시도한다 */
const PARTIAL_TTL_MS = 15 * 1000;
const TIMEOUT_MS = 15_000;

export function phoenixKey(): string | null {
  const key = process.env.PHOENIX_DATA_KEY?.trim();
  if (!key || !key.startsWith("ck_live_") || /\s/.test(key)) return null;
  return key;
}

export function hasPhoenixKey(): boolean {
  return phoenixKey() !== null;
}

export class PhoenixError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly requestId: string,
  ) {
    super(`Phoenix HTTP ${status} ${code} (request ${requestId})`);
  }
}

/** 키·원본 오류 본문은 절대 로그에 남기지 않는다 (빌더 킷 규칙) */
function safe(v: unknown): string {
  return String(v ?? "-").replace(/[^A-Za-z0-9_:.+ /-]/g, "").slice(0, 120);
}

async function call<T>(path: string, parse: (json: unknown) => T): Promise<T> {
  const key = phoenixKey();
  if (!key) throw new PhoenixError(0, "NO_KEY", "-");
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "User-Agent": "stock-call-mvp/0.1",
    },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new PhoenixError(res.status, "NON_JSON", safe(res.headers.get("x-request-id")));
  }
  const err = (json as { error?: { code?: string } } | null)?.error;
  if (!res.ok || err) {
    throw new PhoenixError(res.status, safe(err?.code ?? res.status), safe(res.headers.get("x-request-id")));
  }
  return parse(json);
}

/* ---------- 캐시 ---------- */

type Entry<T> = { expiresAt: number; value: Promise<T> };
const briefCache = new Map<string, Entry<StockBrief>>();

/**
 * Promise 캐시. 같은 종목 동시 요청은 하나로 합쳐진다.
 * make는 { value, ttlMs } 를 돌려줘 결과 상태에 따라 TTL을 정한다(부분 실패 = 짧게).
 * reject된 Promise는 지운다. 만료 뒤 들어온 새 항목을 옛 Promise가 지우지 않도록 동일성 검사를 한다.
 */
function cached<T>(map: Map<string, Entry<T>>, k: string, make: () => Promise<{ value: T; ttlMs: number }>): Promise<T> {
  const hit = map.get(k);
  const now = Date.now();
  if (hit && now < hit.expiresAt) return hit.value;
  for (const [key, e] of map) if (now >= e.expiresAt) map.delete(key); // 만료 항목 정리
  const entry: Entry<T> = { expiresAt: now + CACHE_TTL_MS, value: undefined as unknown as Promise<T> };
  entry.value = make().then(
    ({ value, ttlMs }) => {
      entry.expiresAt = Date.now() + ttlMs;
      return value;
    },
    (err) => {
      if (map.get(k) === entry) map.delete(k);
      throw err;
    },
  );
  map.set(k, entry);
  return entry.value;
}

/* ---------- 개별 엔드포인트 ---------- */

async function fetchQuote(symbol: string) {
  return call(`/quotes/${symbol}`, (j) => QuoteResponse.parse(j).data);
}

async function fetchDisclosures(symbol: string) {
  // 빌더 킷 예제와 같은 경로. 최신순. 같은 제목(임원 소유상황보고서 등)이 연달아 오므로 넉넉히 받아 아래서 중복을 뺀다
  return call(`/disclosures?symbol=${symbol}&limit=12`, (j) => DisclosuresResponse.parse(j).data);
}

async function fetchFinancials(symbol: string) {
  // 최근 분기 영업이익·매출만. period=latest_quarter 는 openapi.json의 period 설명에 명시된 값
  const q = new URLSearchParams({ account: "operating_income,revenue", period: "latest_quarter", limit: "8" });
  return call(`/companies/${symbol}/financials?${q}`, (j) => FinancialsResponse.parse(j).data.rows);
}

/* ---------- 조합 ---------- */

type Filing = { title: string; filed_date: string; url?: string; page_url?: string };

/** 최신순 목록에서 제목이 다른 공시 3건. 같은 유형이 연달아 오면 하나만 남긴다 */
export function pickDistinctDisclosures(list: Filing[]): { title: string; filedDate: string; url?: string }[] {
  const seen = new Set<string>();
  const out: { title: string; filedDate: string; url?: string }[] = [];
  for (const x of list) {
    const title = tidyTitle(x.title);
    const key = title.replace(/\s|\(.*?\)/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, filedDate: x.filed_date, url: x.page_url ?? x.url });
    if (out.length === 3) break;
  }
  return out;
}

/** 종목 한 건의 통화 재료. 일부 실패해도 있는 데이터로만 채우고 출처를 기록한다 */
export async function getStockBrief(symbol: string): Promise<StockBrief> {
  if (!hasPhoenixKey()) return sampleBrief(symbol);
  return cached(briefCache, symbol, async () => {
    const [q, d, f] = await Promise.allSettled([fetchQuote(symbol), fetchDisclosures(symbol), fetchFinancials(symbol)]);

    const quote = q.status === "fulfilled" ? q.value : null;
    const discl = d.status === "fulfilled" ? d.value : null;
    const rows = f.status === "fulfilled" ? f.value : null;

    for (const [name, r] of [["quote", q], ["disclosures", d], ["financials", f]] as const) {
      if (r.status === "rejected") {
        const e = r.reason;
        console.warn(`[phoenix] ${symbol} ${name} 실패:`, e instanceof Error ? e.message : safe(e));
      }
    }

    // 시세가 실패하면 종목명이 없다 → 코드 그대로 두고 라우트가 목록·검색 결과 이름으로 바꾼다
    const name = quote?.name ?? symbol;

    // 영업이익 우선, 없으면 매출. 분기 값만 (연간·누적과 섞지 않는다)
    const pick =
      rows?.find((r) => r.account_code === "operating_income" && r.period_type === "quarter") ??
      rows?.find((r) => r.account_code === "revenue" && r.period_type === "quarter") ??
      null;

    const partial = !quote || !discl || !rows;
    const brief: StockBrief = {
      symbol,
      name,
      exchange: quote?.exchange ?? null,
      sector: quote?.sector ?? null,
      price: quote
        ? {
            current: quote.price.current,
            prevClose: quote.price.prev_close ?? null,
            change: quote.price.change ?? null,
            changePct: toPercent(quote.price.change_percent, quote.price.change_rate),
            asOf: quote.as_of,
            marketStatus: quote.market_status ?? null,
            high52w: quote.range_52w?.high ?? null,
            low52w: quote.range_52w?.low ?? null,
            marketCapRank: quote.fundamentals?.market_cap_rank ?? null,
            foreignRatioPct: quote.fundamentals?.foreign_ratio_pct ?? null,
          }
        : null,
      disclosures: pickDistinctDisclosures(discl ?? []),
      earnings: pick
        ? { account: pick.account, period: pick.period, value: pick.value, unit: pick.unit, preliminary: pick.preliminary ?? false }
        : null,
      source: {
        quote: quote ? "phoenix" : "error",
        disclosures: discl ? "phoenix" : "error",
        earnings: pick ? "phoenix" : rows ? "none" : "error",
      },
      fetchedAt: new Date().toISOString(),
    };
    return { value: brief, ttlMs: partial ? PARTIAL_TTL_MS : CACHE_TTL_MS };
  });
}

/** 종목 검색. 보통주만, 상장 중인 것만 */
export async function searchSymbols(q: string): Promise<SymbolHit[]> {
  if (!hasPhoenixKey()) return sampleSearch(q);
  const params = new URLSearchParams({ q, type: "stock", status: "listed", limit: "8" });
  const data = await call(`/symbols?${params}`, (j) => SymbolsResponse.parse(j).data);
  return data.map((s) => ({ symbol: s.symbol, name: s.name_ko, exchange: s.exchange ?? null, sector: s.sector ?? null }));
}

export type Health = {
  phoenix: { mode: "live" | "sample" | "error"; planLabel?: string; status?: string; used?: number; limit?: number; perMinute?: number; code?: string };
};

let healthCache: { at: number; value: Health } | null = null;

/** GET /key 는 한도를 쓰지 않는다. 시작 시 연결 확인용. 60초 캐시(키별 분당 30회 별도 창) */
export async function checkHealth(): Promise<Health> {
  if (!hasPhoenixKey()) return { phoenix: { mode: "sample" } };
  if (healthCache && Date.now() - healthCache.at < 60_000) return healthCache.value;
  try {
    const k = await call("/key", (j) => KeyResponse.parse(j).data);
    const value: Health = {
      phoenix: {
        mode: "live",
        planLabel: k.plan_label,
        status: k.status,
        used: k.quota?.used,
        limit: k.builder?.limit ?? k.quota?.limit,
        perMinute: k.builder?.perMinute ?? k.rate_limit?.per_minute,
      },
    };
    healthCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    const code = e instanceof PhoenixError ? e.code : "NETWORK";
    return { phoenix: { mode: "error", code } };
  }
}
