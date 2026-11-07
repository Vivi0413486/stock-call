import type Vapi from "@vapi-ai/web";
import type { MoodInfo } from "./mood";
import type { Persona } from "./stocks";

type Assistant = Exclude<NonNullable<Parameters<Vapi["start"]>[0]>, string>;
export type Voice = NonNullable<Assistant["voice"]>;

/**
 * 한국어 TTS 공급자 선택. 전부 Vapi 내장 공급자(크레딧 과금, 별도 키 없음).
 * NEXT_PUBLIC_VAPI_TTS 또는 URL ?tts= : azure(기본, 실측 OK) | 11labs | openai(2026-11-07 실측: 통화가 "Meeting has ended"로 튕김)
 * NEXT_PUBLIC_VAPI_VOICE_ID 로 공급자별 voiceId를 덮어쓸 수 있다.
 */
export const TTS_CHOICES = ["openai", "azure", "11labs"] as const;
export type TtsChoice = (typeof TTS_CHOICES)[number];

export function resolveTtsChoice(raw: string | undefined): TtsChoice {
  const v = (raw ?? "").trim().toLowerCase();
  return (TTS_CHOICES as readonly string[]).includes(v) ? (v as TtsChoice) : "azure";
}

export function buildVoice(choice: TtsChoice, persona: Persona, mood: MoodInfo, voiceIdOverride?: string): Voice {
  const override = voiceIdOverride?.trim() || undefined;
  switch (choice) {
    case "azure":
      // Azure 한국어 신경망 음성. InJoon(남) · SunHi(여) · Hyunsu(남) 등 이름은 Azure 문서 기준
      return { provider: "azure", voiceId: override ?? "ko-KR-InJoonNeural", speed: 1.1 };
    case "11labs":
      return { provider: "11labs", voiceId: override ?? "sarah", model: "eleven_flash_v2_5", language: "ko", stability: 0.35, similarityBoost: 0.8 };
    case "openai":
    default:
      // gpt-4o-mini-tts 는 instructions 로 연기 지시를 받는다. 기분·말투를 그대로 넘긴다
      return {
        provider: "openai",
        model: "gpt-4o-mini-tts",
        voiceId: override ?? (persona.kind === "growth" ? "nuri" : "noeul"),
        speed: 1.05,
        instructions: `한국어 원어민. 20대 ${persona.kind === "growth" ? "하이텐션 막내" : "듬직한 척하는 동생"}가 가족한테 전화로 수다 떠는 말투. 지금 기분: ${mood.label} — ${mood.direction} 감정을 과장해서 연기하되 발음은 또렷하게. 숫자는 한국어로 읽는다.`,
      };
  }
}
