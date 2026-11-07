/** 등락률·수익률로 캐릭터 기분을 결정한다. 결정적 로직이라 LLM에 맡기지 않는다 */

export type Mood = "wailing" | "sulky" | "bored" | "smug" | "cocky" | "unknown";

export type MoodInfo = {
  mood: Mood;
  label: string; // 화면 표시
  emoji: string;
  /** 프롬프트용 연기 지시 */
  direction: string;
  /** 첫 마디 감탄사 */
  exclamation: string;
};

const MOODS: Record<Mood, Omit<MoodInfo, "mood">> = {
  wailing: {
    label: "오열",
    emoji: "😭",
    direction: "오열한다. 말끝마다 울먹이고, '나 진짜 X됐어…' 같은 표현을 쓴다(욕은 X로 가린다). 형한테 버리지 말라고 매달린다.",
    exclamation: "흐어엉…",
  },
  sulky: {
    label: "시무룩",
    emoji: "🥺",
    direction: "시무룩하다. 변명을 많이 한다. '시장이 안 좋았어', '외국인이 팔았어' 같은 핑계를 대며 형 눈치를 본다.",
    exclamation: "하아…",
  },
  bored: {
    label: "심심함",
    emoji: "😐",
    direction: "심심하다. 별일 없어서 존재감을 어필한다. '형 나 잊은 거 아니지?'라며 관심을 구걸한다. 공시를 괜히 크게 포장한다.",
    exclamation: "어… 형?",
  },
  smug: {
    label: "우쭐",
    emoji: "😏",
    direction: "우쭐하다. 은근히 자랑하면서 '나 좀 쓸만하지?'를 반복한다. 형이 더 안 산 걸 아쉬워한다.",
    exclamation: "헤헤, 형!",
  },
  cocky: {
    label: "기고만장",
    emoji: "🤩",
    direction: "기고만장하다. 세상 다 가진 듯 떠들고 형한테 고기 사달라고 조른다. '내가 누구야? 형 효자지?'",
    exclamation: "형!!! 나야 나!!",
  },
  unknown: {
    label: "모름",
    emoji: "📵",
    direction: "오늘 시세를 아직 못 봤다. 등락률을 말하지 않고, 공시나 근황만 얘기한다.",
    exclamation: "여보세요? 형?",
  },
};

export function moodFromChange(changePct: number | null | undefined): MoodInfo {
  let mood: Mood;
  if (changePct === null || changePct === undefined || Number.isNaN(changePct)) mood = "unknown";
  else if (changePct <= -3) mood = "wailing";
  else if (changePct < -0.5) mood = "sulky";
  else if (changePct <= 0.5) mood = "bored";
  else if (changePct < 3) mood = "smug";
  else mood = "cocky";
  return { mood, ...MOODS[mood] };
}

export type Position = { avgPrice: number; quantity: number };

export type Pnl = {
  pct: number; // 수익률 %
  amount: number; // 평가손익 원
  state: "profit" | "loss" | "flat";
};

/** 평단가 대비 수익률. 평단·현재가 둘 다 있어야 계산한다 */
export function computePnl(current: number | null | undefined, pos: Position | null | undefined): Pnl | null {
  if (!current || !pos || !(pos.avgPrice > 0) || !(pos.quantity > 0)) return null;
  const pct = ((current - pos.avgPrice) / pos.avgPrice) * 100;
  const amount = (current - pos.avgPrice) * pos.quantity;
  const state = pct > 0.05 ? "profit" : pct < -0.05 ? "loss" : "flat";
  return { pct, amount, state };
}

/** 소수 change_rate(0.0101)와 퍼센트 change_percent(1.01)를 퍼센트 하나로 통일 */
export function toPercent(changePercent: number | null | undefined, changeRate: number | null | undefined): number | null {
  if (typeof changePercent === "number") return changePercent;
  if (typeof changeRate === "number") return Math.round(changeRate * 10000) / 100;
  return null;
}
