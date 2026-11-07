import type { StockBrief, SymbolHit } from "./schema";
import { QUICK_PICKS } from "./stocks";

/**
 * 키가 없을 때 화면 흐름을 보여주기 위한 샘플 데이터.
 * 실제 시세가 아니며, 화면과 캐릭터 대사에 "샘플"이라고 표시된다.
 * 기준 시각은 2026-11-06 15:30 KST(종가)로 고정.
 */
const SAMPLE_AS_OF = "2026-11-06T06:30:00.000Z";

type Seed = {
  current: number;
  prevClose: number;
  rank: number;
  foreign: number;
  sector: string;
  disclosures: { title: string; filedDate: string }[];
  earnings: { account: string; period: string; value: number; unit: string; preliminary: boolean } | null;
};

const SEEDS: Record<string, Seed> = {
  "005930": {
    current: 103500,
    prevClose: 105900,
    rank: 1,
    foreign: 52.1,
    sector: "반도체와반도체장비",
    disclosures: [
      { title: "기업설명회(IR) 개최(안내공시)", filedDate: "2026-11-05" },
      { title: "연결재무제표 기준 영업(잠정)실적(공정공시)", filedDate: "2026-10-30" },
      { title: "주요사항보고서(자기주식취득결정)", filedDate: "2026-10-28" },
    ],
    earnings: { account: "영업이익", period: "2026 3분기", value: 121000, unit: "억원", preliminary: true },
  },
  "000660": {
    current: 612000,
    prevClose: 588000,
    rank: 2,
    foreign: 55.4,
    sector: "반도체와반도체장비",
    disclosures: [
      { title: "연결재무제표 기준 영업(잠정)실적(공정공시)", filedDate: "2026-10-29" },
      { title: "기업설명회(IR) 개최(안내공시)", filedDate: "2026-10-22" },
      { title: "주요사항보고서(유형자산취득결정)", filedDate: "2026-10-15" },
    ],
    earnings: { account: "영업이익", period: "2026 3분기", value: 118000, unit: "억원", preliminary: true },
  },
  "035720": {
    current: 58200,
    prevClose: 60400,
    rank: 24,
    foreign: 27.3,
    sector: "양방향미디어와서비스",
    disclosures: [
      { title: "분기보고서 (2026.09)", filedDate: "2026-11-05" },
      { title: "타법인주식및출자증권처분결정", filedDate: "2026-10-27" },
      { title: "기업설명회(IR) 개최(안내공시)", filedDate: "2026-10-23" },
    ],
    earnings: { account: "영업이익", period: "2026 3분기", value: 1560, unit: "억원", preliminary: false },
  },
  "035420": {
    current: 248500,
    prevClose: 247000,
    rank: 9,
    foreign: 44.8,
    sector: "양방향미디어와서비스",
    disclosures: [
      { title: "분기보고서 (2026.09)", filedDate: "2026-11-06" },
      { title: "기업설명회(IR) 개최(안내공시)", filedDate: "2026-10-30" },
      { title: "주요사항보고서(자기주식취득결정)", filedDate: "2026-10-20" },
    ],
    earnings: { account: "영업이익", period: "2026 3분기", value: 5680, unit: "억원", preliminary: false },
  },
  "086520": {
    current: 94100,
    prevClose: 89800,
    rank: 31,
    foreign: 8.9,
    sector: "전기장비",
    disclosures: [
      { title: "분기보고서 (2026.09)", filedDate: "2026-11-06" },
      { title: "조회공시요구(풍문또는보도)에대한답변(미확정)", filedDate: "2026-10-31" },
      { title: "주요사항보고서(유상증자결정)", filedDate: "2026-10-14" },
    ],
    earnings: { account: "영업이익", period: "2026 3분기", value: 320, unit: "억원", preliminary: false },
  },
};

export function sampleBrief(symbol: string): StockBrief {
  const pick = QUICK_PICKS.find((p) => p.symbol === symbol);
  const seed = SEEDS[symbol];
  if (!seed) {
    // 목록 밖 종목: 샘플조차 없다. 시세 없이 이름만.
    return {
      symbol,
      name: pick?.name ?? symbol,
      exchange: null,
      sector: null,
      price: null,
      disclosures: [],
      earnings: null,
      source: { quote: "none", disclosures: "none", earnings: "none" },
      fetchedAt: new Date().toISOString(),
    };
  }
  const change = seed.current - seed.prevClose;
  return {
    symbol,
    name: pick?.name ?? symbol,
    exchange: "KOSPI",
    sector: seed.sector,
    price: {
      current: seed.current,
      prevClose: seed.prevClose,
      change,
      changePct: Math.round((change / seed.prevClose) * 10000) / 100,
      asOf: SAMPLE_AS_OF,
      marketStatus: "장마감",
      high52w: null,
      low52w: null,
      marketCapRank: seed.rank,
      foreignRatioPct: seed.foreign,
    },
    disclosures: seed.disclosures,
    earnings: seed.earnings,
    source: { quote: "sample", disclosures: "sample", earnings: seed.earnings ? "sample" : "none" },
    fetchedAt: new Date().toISOString(),
  };
}

export function sampleSearch(q: string): SymbolHit[] {
  const needle = q.replace(/\s/g, "").toLowerCase();
  return QUICK_PICKS.filter((p) => p.symbol.startsWith(needle) || p.name.toLowerCase().includes(needle)).map((p) => ({
    symbol: p.symbol,
    name: p.name,
    exchange: "KOSPI",
    sector: SEEDS[p.symbol]?.sector ?? null,
  }));
}
