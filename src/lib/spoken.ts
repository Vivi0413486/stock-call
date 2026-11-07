/**
 * 음성용 숫자 읽기. ElevenLabs(한국어)는 아라비아 숫자를 영어로 읽거나 자릿수를 하나씩 읽는다
 * (실측: "6.3퍼센트" → "식스 포인트 쓰리", "188,700원" → "1 8 8 7 0 0").
 * 그래서 TTS로 가는 문장은 전부 한글 수사로 풀어 쓴다.
 */

const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL = ["", "십", "백", "천"];
const BIG = ["", "만", "억", "조", "경"];

/** 0~9999 를 한글로. 1은 자리 앞에서 생략 ("천이백" , 단 맨 끝 "일"은 유지) */
function under10k(n: number, isFirstGroup: boolean): string {
  let out = "";
  for (let i = 3; i >= 0; i--) {
    const d = Math.floor(n / 10 ** i) % 10;
    if (!d) continue;
    // "일십"·"일백"·"일천"은 "십"·"백"·"천"으로. 만 단위 이상의 첫 그룹에서 "일만"은 "만"으로 읽는다
    const digit = d === 1 && i > 0 ? "" : DIGITS[d];
    out += digit + SMALL[i];
  }
  void isFirstGroup;
  return out;
}

/** 정수를 한글 수사로. 0 → "영", 188700 → "십팔만 팔천칠백" */
export function koInteger(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return "영";
  const groups: string[] = [];
  let i = 0;
  while (n > 0 && i < BIG.length) {
    const g = n % 10000;
    if (g) {
      let word = under10k(g, i > 0);
      // "일만"→"만" (단, 만 그룹이 정확히 1일 때만)
      if (i >= 1 && g === 1) word = "";
      groups.unshift(word + BIG[i]);
    }
    n = Math.floor(n / 10000);
    i += 1;
  }
  return groups.join(" ");
}

/** 소수를 "육 점 삼" 처럼. 소수부는 자릿수 하나씩 */
export function koDecimal(n: number, digits = 1): string {
  const sign = n < 0 ? "마이너스 " : "";
  const fixed = Math.abs(n).toFixed(digits);
  const [int, frac] = fixed.split(".");
  const intWord = koInteger(Number(int));
  if (!frac || /^0+$/.test(frac)) return sign + intWord;
  const fracWord = frac
    .split("")
    .map((c) => (c === "0" ? "영" : DIGITS[Number(c)]))
    .join(" ");
  return `${sign}${intWord} 점 ${fracWord}`;
}

/** 등락률·수익률: 부호 없이 크기만 ("육 점 삼 퍼센트"). 방향은 문장이 말한다 */
export function spokenPct(p: number): string {
  return `${koDecimal(Math.abs(p), 1)} 퍼센트`;
}

/** 원화 금액: "십팔만 팔천칠백 원" */
export function spokenKrw(n: number): string {
  return `${koInteger(n)} 원`;
}

/** 억원 단위 재무 값: 1074400 억원 → "백칠조 사천사백억 원" */
export function spokenEok(value: number, unit: string): string {
  if (unit !== "억원") return `${koInteger(value)} ${unit}`;
  const sign = value < 0 ? "마이너스 " : "";
  return `${sign}${koInteger(Math.abs(Math.round(value)) * 100_000_000)} 원`;
}

/** 수량: 10 → "열 주"? 한자어가 자연스럽다: "십 주" */
export function spokenShares(n: number): string {
  return `${koInteger(n)} 주`;
}
