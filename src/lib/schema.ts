import { z } from "zod";

/**
 * Phoenix AI 응답 중 우리가 실제로 읽는 필드만 느슨하게 검증한다.
 * (looseObject: 모르는 필드가 늘어나도 파싱이 깨지지 않는다)
 * 필드명은 openapi.json(1.20.0) 기준. 추측으로 만든 필드 없음.
 */

const nullableNumber = z.number().nullable().optional();

/** GET /quotes/{symbol} — 표준 모양은 data.*, 최상위 칸은 deprecated라 읽지 않는다 */
export const QuoteResponse = z.looseObject({
  data: z.looseObject({
    symbol: z.string(),
    name: z.string().nullable().optional(),
    exchange: z.string().nullable().optional(),
    currency: z.string().optional(),
    price: z.looseObject({
      current: z.number(),
      prev_close: nullableNumber,
      change: nullableNumber,
      change_rate: nullableNumber, // 소수 (0.0101 = +1.01%)
      change_percent: nullableNumber, // 퍼센트 (1.01)
    }),
    range_52w: z
      .looseObject({ high: nullableNumber, low: nullableNumber })
      .optional(),
    fundamentals: z
      .looseObject({ market_cap_rank: nullableNumber, foreign_ratio_pct: nullableNumber })
      .nullable()
      .optional(),
    sector: z.string().nullable().optional(),
    market_status: z.string().nullable().optional(),
    as_of: z.string(),
  }),
  meta: z.looseObject({ as_of: z.string().optional(), price_note: z.string().optional() }).optional(),
});

/** GET /disclosures?symbol= — KrFiling 배열 */
export const DisclosuresResponse = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(),
      title: z.string(),
      filed_date: z.string(),
      url: z.string().optional(),
      page_url: z.string().optional(),
      report_code: z.string().nullable().optional(),
    }),
  ),
  meta: z.looseObject({ as_of: z.string().optional() }).optional(),
});

/** GET /companies/{symbol}/financials — data.rows */
export const FinancialsResponse = z.looseObject({
  data: z.looseObject({
    rows: z.array(
      z.looseObject({
        account: z.string(),
        account_code: z.string().nullable().optional(),
        period: z.string(),
        period_code: z.string().nullable().optional(),
        period_type: z.string(),
        value: z.number(),
        unit: z.string(),
        value_raw: nullableNumber,
        preliminary: z.boolean().optional(),
        source: z.string().optional(),
      }),
    ),
  }),
});

/** GET /symbols?q= */
export const SymbolsResponse = z.looseObject({
  data: z.array(
    z.looseObject({
      symbol: z.string(),
      name_ko: z.string(),
      exchange: z.string().nullable().optional(),
      type: z.string().optional(),
      sector: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
    }),
  ),
});

/** GET /key — 한도를 쓰지 않는 연결 확인 */
export const KeyResponse = z.looseObject({
  data: z.looseObject({
    plan_label: z.string().optional(),
    status: z.string().optional(),
    quota: z
      .looseObject({ limit: z.number().optional(), used: z.number().optional(), remaining: z.number().optional() })
      .optional(),
    builder: z
      .looseObject({ phase: z.string().optional(), limit: z.number().optional(), perMinute: z.number().optional() })
      .optional(),
    rate_limit: z.looseObject({ per_minute: z.number().optional() }).optional(),
  }),
});

/* ---------- 앱 내부 모양 (클라이언트와 공유) ---------- */

export const Disclosure = z.object({
  title: z.string(),
  filedDate: z.string(), // YYYY-MM-DD
  url: z.string().optional(),
});
export type Disclosure = z.infer<typeof Disclosure>;

export const Earnings = z.object({
  account: z.string(), // "영업이익" 등
  period: z.string(), // "2026 3분기"
  value: z.number(), // 표시 단위 값
  unit: z.string(), // "억원"
  preliminary: z.boolean(),
});
export type Earnings = z.infer<typeof Earnings>;

export const StockBrief = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string().nullable(),
  sector: z.string().nullable(),
  price: z
    .object({
      current: z.number(),
      prevClose: z.number().nullable(),
      change: z.number().nullable(),
      changePct: z.number().nullable(), // 퍼센트 단위로 통일 (2.3 = +2.3%)
      asOf: z.string(), // ISO. API가 준 기준 시각 그대로
      marketStatus: z.string().nullable(),
      high52w: z.number().nullable(),
      low52w: z.number().nullable(),
      marketCapRank: z.number().nullable(),
      foreignRatioPct: z.number().nullable(),
    })
    .nullable(),
  disclosures: z.array(Disclosure), // 최대 3건
  earnings: Earnings.nullable(),
  /** 어떤 데이터가 실제 API에서 왔는지. none=해당 없음, error=조회 실패(캐릭터가 언급하지 않는다) */
  source: z.object({
    quote: z.enum(["phoenix", "sample", "none", "error"]),
    disclosures: z.enum(["phoenix", "sample", "none", "error"]),
    earnings: z.enum(["phoenix", "sample", "none", "error"]),
  }),
  fetchedAt: z.string(),
});
export type StockBrief = z.infer<typeof StockBrief>;

export const SymbolHit = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string().nullable(),
  sector: z.string().nullable(),
});
export type SymbolHit = z.infer<typeof SymbolHit>;
