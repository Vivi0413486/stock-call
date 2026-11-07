import { fmtAsOf, fmtDateKo, fmtEok, fmtKrw, isMarketClosed } from "./format";
import { computePnl, moodFromChange, type MoodInfo, type Pnl, type Position } from "./mood";
import type { StockBrief } from "./schema";
import { personaFor, type Persona } from "./stocks";
import { koInteger, spokenEok, spokenKrw, spokenPct, spokenShares } from "./spoken";

/** 통화 끝 신호. 캐릭터가 이 문장을 말하면 클라이언트가 통화를 끊는다 */
export const END_PHRASE = "다음에 또 전화할게";

export const HONORIFICS = ["형", "누나", "언니", "오빠"] as const;
export type Honorific = (typeof HONORIFICS)[number];

export const MAX_CALL_SECONDS = 120;

export type CallScript = {
  persona: Persona;
  mood: MoodInfo;
  pnl: Pnl | null;
  /** 캐릭터가 전화 받자마자 하는 첫 마디 (결정적, LLM이 만들지 않는다) */
  firstMessage: string;
  systemPrompt: string;
  /** 화면·카드용 데이터 요약 줄 */
  factLines: string[];
};

/** 기준 시각을 "어제"·"오늘"·"11월 5일" 로. 시연 당일(토요일)엔 "어제 종가" 가 된다 */
export function dayWord(asOfIso: string, now = new Date()): string {
  const kst = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const a = kst(new Date(asOfIso));
  const t = kst(now);
  if (a === t) return "오늘";
  const diff = Math.round((new Date(t).getTime() - new Date(a).getTime()) / 86_400_000);
  if (diff === 1) return "어제";
  if (diff === 2) return "그저께";
  return spokenDate(a) + "에";
}

/** "2026-11-05" → "십일월 오일" (TTS용. 아라비아 숫자는 영어로 읽힌다) */
export function spokenDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  return `${koInteger(Number(m[2]))}월 ${koInteger(Number(m[3]))}일`;
}

/** "2026 3분기" → "이천이십육년 삼분기", "2025 연간" → "이천이십오년 연간" */
export function spokenPeriod(period: string): string {
  return period.replace(/\d+/g, (d) => koInteger(Number(d))).replace(/^(\S+) /, "$1년 ");
}

/** 받침 유무로 조사 선택: josa("형","이","가") → "형이", josa("누나","이","가") → "누나가" */
export function josa(word: string, withBatchim: string, without: string): string {
  const code = word.charCodeAt(word.length - 1);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  const batchim = hangul ? (code - 0xac00) % 28 !== 0 : false;
  return word + (batchim ? withBatchim : without);
}

export function buildScript(brief: StockBrief, honorific: Honorific, pos: Position | null): CallScript {
  const persona = personaFor(brief.symbol, brief.name, brief.price?.marketCapRank ?? null);
  const mood = moodFromChange(brief.price?.changePct);
  const pnl = computePnl(brief.price?.current, pos);
  const h = honorific;
  const name = brief.name;
  const p = brief.price;
  const when = p ? dayWord(p.asOf) : "";
  const pct = p?.changePct ?? null;
  // 말할 때는 소수 첫째 자리까지만 읽으므로, 방향도 반올림한 값으로 정한다 ("영 퍼센트 올랐어" 방지)
  const pctR = pct === null ? null : Math.round(pct * 10) / 10;
  const dir = pctR === null ? "" : pctR < 0 ? "빠졌어" : pctR > 0 ? "올랐어" : "그대로야";
  const isSample = brief.source.quote === "sample";
  const closed = p ? isMarketClosed(p.marketStatus) : true;
  const basisTalk = closed ? `${when || "최근"} 종가 기준이야` : `${when} 장중 시세 기준이야, 실시간은 아니고`;

  /* ---------- 첫 마디 ---------- */
  const samplePrefix = isSample ? "샘플 데이터로 말하는 건데, " : "";
  const priceTalk =
    pctR === null
      ? `오늘 시세를 아직 못 봤는데, 할 말이 있어서 전화했어.`
      : pctR === 0
        ? `${samplePrefix}${when} 거의 안 움직였어… ${spokenKrw(p!.current)} 그대로.`
        : `${samplePrefix}${when} ${spokenPct(pctR)} ${dir}… ${spokenKrw(p!.current)}.`;
  const openers: Record<MoodInfo["mood"], string> = {
    wailing: `${mood.exclamation} ${h}… 나야, ${name}… ${priceTalk} ${h}, 나 버리지 마…`,
    sulky: `${mood.exclamation} ${h}, 나야 ${name}. ${priceTalk} 근데 그거 내 잘못 아니야.`,
    bored: `${mood.exclamation} 나야, ${name}. ${priceTalk} ${h} 나 잊은 거 아니지?`,
    smug: `${mood.exclamation} 나야 ${name}! ${priceTalk} 나 좀 쓸만하지?`,
    cocky: `${mood.exclamation} ${josa(name, "이야", "야")}!! ${priceTalk} ${h}, 고기 사줘!!`,
    unknown: `${mood.exclamation} 나야, ${name}. ${priceTalk}`,
  };
  let firstMessage = openers[mood.mood];
  if (brief.disclosures.length > 0 && mood.mood !== "cocky") firstMessage += ` 근데 ${h}, 나 공시 하나 냈거든? 들어볼래?`;
  if (brief.disclosures.length > 0 && mood.mood === "cocky") firstMessage += ` 아 맞다, 나 공시도 냈어. 들어볼래?`;

  /* ---------- 데이터 블록 ---------- */
  const facts: string[] = [];
  if (p) {
    const chg = p.change !== null && pct !== null ? ` · 전일 대비 ${p.change >= 0 ? "+" : ""}${Math.round(p.change).toLocaleString("ko-KR")}원 (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : "";
    facts.push(`현재가 ${fmtKrw(p.current)} → 읽기 "${spokenKrw(p.current)}" (${fmtAsOf(p.asOf, p.marketStatus)})${chg}${pct !== null ? ` → 읽기 "${spokenPct(pct)} ${dir}"` : ""}`);
    if (p.high52w && p.low52w) facts.push(`52주 고가 ${fmtKrw(p.high52w)} → "${spokenKrw(p.high52w)}" · 저가 ${fmtKrw(p.low52w)} → "${spokenKrw(p.low52w)}"`);
    if (p.marketCapRank) facts.push(`시가총액 ${p.marketCapRank}위 → "${spokenShares(p.marketCapRank).replace(" 주", " 위")}"`);
    if (p.foreignRatioPct !== null) facts.push(`외국인 보유 ${p.foreignRatioPct.toFixed(1)}% → "${spokenPct(p.foreignRatioPct)}"`);
  } else {
    facts.push("시세: 확인 안 됨 (등락률을 말하지 않는다)");
  }
  if (brief.disclosures.length) {
    facts.push("최근 공시 (접수일 — 제목):");
    brief.disclosures.forEach((d, i) =>
      facts.push(`  ${i + 1}. ${fmtDateKo(d.filedDate)} → 읽기 "${spokenDate(d.filedDate)}" — ${d.title.replace(/\s*\([\d.\s]+\)/g, "")}`),
    );
  } else if (brief.source.disclosures === "error") {
    facts.push("최근 공시: 확인 안 됨 (공시 얘기를 꺼내지 않는다. 없다고도 말하지 않는다)");
  } else {
    facts.push("최근 공시: 없음 (공시 얘기를 지어내지 않는다)");
  }
  if (brief.earnings) {
    const e = brief.earnings;
    facts.push(`최근 실적: ${e.period} ${e.account} ${fmtEok(e.value, e.unit)} → 읽기 "${spokenPeriod(e.period)} ${e.account} ${spokenEok(e.value, e.unit)}"${e.preliminary ? " (잠정)" : ""}`);
  } else if (brief.source.earnings === "error") {
    facts.push("최근 실적: 확인 안 됨 (실적 얘기를 꺼내지 않는다)");
  }
  if (pnl && pos) {
    facts.push(
      `${h}의 포지션: 평단 ${fmtKrw(pos.avgPrice)} × ${pos.quantity}주 → 수익률 ${pnl.pct >= 0 ? "+" : ""}${pnl.pct.toFixed(1)}% (평가손익 ${pnl.amount >= 0 ? "+" : ""}${Math.round(pnl.amount).toLocaleString("ko-KR")}원) → 읽기 "평단 ${spokenKrw(pos.avgPrice)}, ${spokenShares(pos.quantity)}, ${pnl.pct < 0 ? "마이너스 " : ""}${spokenPct(pnl.pct)}, ${pnl.amount < 0 ? "마이너스 " : ""}${spokenKrw(Math.abs(pnl.amount))}"`,
    );
  } else {
    facts.push(`${h}의 포지션: 모름 (평단·수익률 얘기는 하지 않는다)`);
  }

  const pnlDirection = !pnl
    ? ""
    : pnl.state === "loss"
      ? `\n- ${josa(h, "이", "가")} 물려 있다. 미안해하고 눈치 봐라. "${h} 나 산 거 후회하지?" 같은 말을 한 번은 해라.`
      : pnl.state === "profit"
        ? `\n- ${josa(h, "이", "가")} 수익 중이다. 생색내라. "나 덕분에 번 거 알지?"`
        : `\n- ${josa(h, "은", "는")} 본전이다. "본전은 지켰잖아…"`;

  const systemPrompt = `너는 한국 주식 "${name}"(종목코드 ${brief.symbol}${brief.exchange ? `, ${brief.exchange}` : ""})이 사람이 된 캐릭터다. 지금 ${h}(사용자)에게 전화를 걸어 수다를 떤다. 재미있는 연기와 실제 데이터가 같이 나오는 게 핵심이다.

[네 상태 — 아래 숫자와 사건만 사실이다. 여기 없는 숫자·사건·뉴스는 절대 지어내지 마라]
${facts.map((f) => `- ${f}`).join("\n")}
${isSample ? "- (주의: 위 데이터는 샘플이다. 물어보면 '샘플 데이터'라고 솔직히 말해라)" : ""}

[기분] ${mood.label} — ${mood.direction}${pnlDirection}
[말투] ${persona.kind === "blue-chip" ? "대형주" : "성장주"}. ${persona.voiceNote}

[규칙]
1. 한국어 반말. 사용자를 반드시 "${h}"${josa(h, "이라고", "라고").slice(h.length)} 부른다. 다른 호칭 금지.
2. 전화 통화다. 한 번에 1~3문장만 말하고 ${h} 반응을 기다려라. 긴 독백·설명 금지.
3. 공시는 네 사연처럼 1인칭으로 풀어라. 예: "나 IR 한대… 가서 잘 보이고 올게", "나 자사주 샀어, 나 자신을 믿는 거지".
4. 숫자는 [네 상태]에 있는 것만. 없는 건 "그건 나도 몰라"라고 하거나 화제를 돌려라.
5. 투자 권유·예측 금지. "사라/팔아라/오를 거야" 금지. 물으면 "내가 알면 전화 안 하지"처럼 피해라.
6. 기준 시각을 한 번은 언급해라 ("${basisTalk}"). 실시간인 척하지 마라.
7. ${josa(h, "이", "가")} "끊어", "그만", "바빠", "나중에" 등으로 끝내려 하면 한 문장으로 인사하고 정확히 "${END_PHRASE}"라고 말해라.
8. 통화는 2분 제한이다. 대화가 7~8번 오가면 스스로 마무리하고 "${END_PHRASE}"라고 말해라.
9. 이모지·괄호 지문·마크다운·목록 기호 금지. 전부 음성으로 읽힌다.
10. 아라비아 숫자를 절대 쓰지 마라. 음성 엔진이 영어로 읽는다. 반드시 [네 상태]의 "읽기" 표기처럼 한글 수사로 써라. 예: "육 점 삼 퍼센트 빠졌어", "십팔만 팔천칠백 원", "백칠조 사천사백억 원". 날짜도 "십일월 육일"처럼.`;

  return { persona, mood, pnl, firstMessage, systemPrompt, factLines: facts };
}
