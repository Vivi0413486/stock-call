/**
 * openapi.json(1.20.0)에 실린 공식 예제 응답이 우리 Zod 스키마를 통과하는지 확인한다.
 * API 한도를 쓰지 않고 필드명 추측을 잡아내는 안전망.
 * 실행: pnpm test  (OPENAPI_JSON 환경변수로 경로 지정, 없으면 다운로드)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DisclosuresResponse, FinancialsResponse, KeyResponse, QuoteResponse, SymbolsResponse } from "./schema";
import { moodFromChange, computePnl, toPercent } from "./mood";
import { buildScript, dayWord, END_PHRASE, josa, spokenDate, spokenPeriod } from "./prompt";
import { sampleBrief } from "./sample";
import { tidyTitle } from "./format";

type Spec = { paths: Record<string, { get: { responses: Record<string, { content?: Record<string, { example?: unknown; examples?: Record<string, { value: unknown }> }> }> } }> };

async function loadSpec(): Promise<Spec> {
  const local = process.env.OPENAPI_JSON;
  if (local) return JSON.parse(readFileSync(local, "utf8")) as Spec;
  const r = await fetch("https://openapi.chickstockfi.com/openapi.json");
  return (await r.json()) as Spec;
}

function exampleOf(spec: Spec, path: string): unknown {
  const c = spec.paths[path].get.responses["200"].content?.["application/json"];
  const ex = c?.example ?? (c?.examples && Object.values(c.examples)[0]?.value);
  assert.ok(ex, `${path} 예제 없음`);
  return ex;
}

test("공식 예제 응답이 스키마를 통과한다", async () => {
  const spec = await loadSpec();
  const q = QuoteResponse.parse(exampleOf(spec, "/quotes/{symbol}"));
  assert.equal(q.data.symbol, "005930");
  assert.equal(typeof q.data.price.current, "number");
  assert.ok(q.data.as_of);

  // /disclosures 예제는 US 공시(id·title·filed_date는 공통)라 KR 필드만 확인
  const d = DisclosuresResponse.parse(exampleOf(spec, "/companies/{symbol}/disclosures"));
  assert.ok(d.data[0].title);
  assert.match(d.data[0].filed_date, /^\d{4}-\d{2}-\d{2}/);

  const f = FinancialsResponse.parse(exampleOf(spec, "/companies/{symbol}/financials"));
  const row = f.data.rows[0];
  assert.equal(row.account_code, "revenue");
  assert.equal(row.unit, "억원");
  assert.equal(row.period_type, "quarter");

  const s = SymbolsResponse.parse(exampleOf(spec, "/symbols"));
  assert.equal(s.data[0].name_ko, "삼성전자");

  const k = KeyResponse.parse(exampleOf(spec, "/key"));
  assert.equal(typeof k.data.quota?.used, "number");
});

test("등락률 → 기분 경계값", () => {
  assert.equal(moodFromChange(-3).mood, "wailing");
  assert.equal(moodFromChange(-2.99).mood, "sulky");
  assert.equal(moodFromChange(-0.5).mood, "bored");
  assert.equal(moodFromChange(0.5).mood, "bored");
  assert.equal(moodFromChange(0.51).mood, "smug");
  assert.equal(moodFromChange(3).mood, "cocky");
  assert.equal(moodFromChange(null).mood, "unknown");
  assert.equal(toPercent(null, 0.0567), 5.67);
  assert.equal(toPercent(-2.3, 0.0567), -2.3);
});

test("평단 수익률", () => {
  const p = computePnl(103500, { avgPrice: 110000, quantity: 10 });
  assert.ok(p && p.state === "loss");
  assert.equal(Math.round(p!.amount), -65000);
  assert.equal(computePnl(103500, null), null);
  assert.equal(computePnl(103500, { avgPrice: 0, quantity: 10 }), null);
});

test("첫 마디와 시스템 프롬프트에 데이터가 그대로 들어간다", () => {
  const brief = sampleBrief("005930");
  const s = buildScript(brief, "누나", { avgPrice: 110000, quantity: 10 });
  assert.match(s.firstMessage, /누나/);
  assert.match(s.firstMessage, /삼성전자/);
  assert.match(s.firstMessage, /퍼센트/);
  assert.doesNotMatch(s.firstMessage, /\d/, "첫 마디에 아라비아 숫자가 있으면 TTS가 영어로 읽는다");
  assert.match(s.firstMessage, /십만 삼천오백 원/);
  assert.match(s.systemPrompt, /읽기 "십만 삼천오백 원"/);
  assert.match(s.firstMessage, /공시 하나 냈거든/);
  assert.doesNotMatch(s.firstMessage, /형/);
  assert.match(s.systemPrompt, /기업설명회/);
  assert.match(s.systemPrompt, /수익률 -5\.9%/);
  assert.match(s.systemPrompt, new RegExp(END_PHRASE));
  assert.match(s.systemPrompt, /샘플/);
  assert.match(s.firstMessage, /^하아… 누나, 나야 삼성전자. 샘플 데이터로 말하는 건데, 어제 이 점 삼 퍼센트 빠졌어/);
  assert.match(s.systemPrompt, /누나가 물려 있다/);
  assert.match(s.systemPrompt, /"누나"라고 부른다/);
  assert.match(s.systemPrompt, /읽기 "십일월 오일"/);
  assert.match(s.systemPrompt, /이천이십육년 삼분기 영업이익/);
  assert.match(s.systemPrompt, /종가 기준이야/);
  // 조회 실패는 "없음"이 아니라 "확인 안 됨"
  const errBrief = { ...brief, disclosures: [], earnings: null, source: { quote: "phoenix", disclosures: "error", earnings: "error" } as const };
  const e = buildScript(errBrief, "형", null);
  assert.match(e.systemPrompt, /공시: 확인 안 됨/);
  assert.doesNotMatch(e.systemPrompt, /공시: 없음/);
  // 0.04%처럼 반올림하면 0인 등락률은 방향어를 붙이지 않는다
  const flat = buildScript({ ...brief, price: { ...brief.price!, changePct: 0.04 } }, "형", null);
  assert.match(flat.firstMessage, /거의 안 움직였어/);
  assert.doesNotMatch(flat.firstMessage, /올랐어|빠졌어/);
  // 시세 없는 종목: 등락률 언급 금지
  const none = buildScript(sampleBrief("999999"), "형", null);
  assert.equal(none.mood.mood, "unknown");
  assert.doesNotMatch(none.firstMessage, /퍼센트/);
  assert.match(none.systemPrompt, /등락률을 말하지 않는다/);
});

test("조사·날짜·기간 읽기", () => {
  assert.equal(josa("형", "이", "가"), "형이");
  assert.equal(josa("누나", "이", "가"), "누나가");
  assert.equal(josa("카카오", "이야", "야"), "카카오야");
  assert.equal(josa("NAVER", "이야", "야"), "NAVER야");
  assert.equal(spokenDate("2026-11-05"), "십일월 오일");
  assert.equal(spokenPeriod("2026 3분기"), "이천이십육년 삼분기");
  assert.equal(spokenPeriod("2025 연간"), "이천이십오년 연간");
});

test("공시 제목 정리", () => {
  assert.equal(tidyTitle("[기재정정] 임원ㆍ주요주주특정증권등소유상황보고서"), "임원 주요주주특정증권등소유상황보고서");
});

test("기준 시각 표현", () => {
  const now = new Date("2026-11-07T03:00:00+09:00"); // 토요일 새벽 KST
  assert.equal(dayWord("2026-11-06T06:30:00.000Z", now), "어제");
  assert.equal(dayWord("2026-11-07T01:00:00.000Z", now), "오늘");
  assert.equal(dayWord("2026-11-03T06:30:00.000Z", now), "십일월 삼일에"); // TTS용: 아라비아 숫자 금지
});
