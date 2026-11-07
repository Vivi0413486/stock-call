import type Vapi from "@vapi-ai/web";
import type { MoodInfo } from "./mood";
import type { Persona } from "./stocks";

type Assistant = Exclude<NonNullable<Parameters<Vapi["start"]>[0]>, string>;
export type Voice = NonNullable<Assistant["voice"]>;

/**
 * 한국어 TTS 공급자 선택. 전부 Vapi 내장 공급자(크레딧 과금, 별도 키 없음).
 * NEXT_PUBLIC_VAPI_TTS 또는 URL ?tts= : minimax(기본, 한국어 보이스 49종+감정) | azure | 11labs | openai(gpt-4o-mini-tts는 튕김, tts-1-hd는 OK)
 * NEXT_PUBLIC_VAPI_VOICE_ID 로 공급자별 voiceId를 덮어쓸 수 있다.
 */
export const TTS_CHOICES = ["minimax", "cartesia", "azure", "11labs", "openai"] as const;
export type TtsChoice = (typeof TTS_CHOICES)[number];

export function resolveTtsChoice(raw: string | undefined): TtsChoice {
  const v = (raw ?? "").trim().toLowerCase();
  return (TTS_CHOICES as readonly string[]).includes(v) ? (v as TtsChoice) : "minimax";
}

export function buildVoice(choice: TtsChoice, persona: Persona, mood: MoodInfo, voiceIdOverride?: string, modelOverride?: string): Voice {
  const override = voiceIdOverride?.trim() || undefined;
  const model = modelOverride?.trim() || undefined;
  switch (choice) {
    case "minimax": {
      // MiniMax speech-02-hd 한국어 시스템 보이스(platform.minimax.io/docs/faq/system-voice-id, 49종).
      // 대형주는 듬직한 척 → CheerfulBoyfriend, 성장주는 하이텐션 → CheerfulCoolJunior. emotion은 기분에서.
      const emotion: Record<MoodInfo["mood"], string> = { wailing: "sad", sulky: "sad", bored: "neutral", smug: "happy", cocky: "happy", unknown: "neutral" };
      return {
        provider: "minimax",
        model: (model ?? "speech-02-hd") as "speech-02-hd" | "speech-02-turbo",
        voiceId: override ?? (persona.kind === "growth" ? "Korean_CheerfulCoolJunior" : "Korean_CheerfulBoyfriend"),
        emotion: emotion[mood.mood],
      };
    }
    case "cartesia":
      // Cartesia sonic-3.5 한국어. 보이스 ID는 cartesia.ai 라이브러리(language=ko)에서 Aside가 고른 것
      return {
        provider: "cartesia",
        model: (model ?? "sonic-3.5") as "sonic-3.5" | "sonic-3" | "sonic-2",
        language: "ko",
        voiceId: override ?? (persona.kind === "growth" ? "537a82ae-4926-4bfb-9aec-aff0b80a12a5" : "e1717dc3-b87b-4720-aa7f-b6db290e0609"),
      };
    case "azure":
      // Azure 한국어 신경망 음성. InJoon(남) · SunHi(여) · Hyunsu(남) 등 이름은 Azure 문서 기준
      return { provider: "azure", voiceId: override ?? "ko-KR-InJoonNeural", speed: 1.1 };
    case "11labs":
      // model: eleven_flash_v2_5(빠름) · eleven_multilingual_v2(품질) · eleven_v3(표현력). language 강제는 flash v2.5만 허용
      {
        const m = (model ?? "eleven_flash_v2_5") as "eleven_flash_v2_5" | "eleven_multilingual_v2" | "eleven_v3" | "eleven_turbo_v2_5";
        return m === "eleven_flash_v2_5"
          ? { provider: "11labs", voiceId: override ?? "sarah", model: m, language: "ko", stability: 0.35, similarityBoost: 0.8 }
          : { provider: "11labs", voiceId: override ?? "sarah", model: m, stability: 0.4, similarityBoost: 0.8 };
      }
    case "openai":
    default:
      // gpt-4o-mini-tts 는 instructions 로 연기 지시를 받는다. 기분·말투를 그대로 넘긴다
      return {
        provider: "openai",
        model: (model ?? "gpt-4o-mini-tts") as "gpt-4o-mini-tts" | "tts-1" | "tts-1-hd",
        voiceId: override ?? "ash",
        speed: 1.05,
        instructions: `한국어 원어민. 20대 ${persona.kind === "growth" ? "하이텐션 막내" : "듬직한 척하는 동생"}가 가족한테 전화로 수다 떠는 말투. 지금 기분: ${mood.label} — ${mood.direction} 감정을 과장해서 연기하되 발음은 또렷하게. 숫자는 한국어로 읽는다.`,
      };
  }
}
