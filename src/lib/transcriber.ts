import type Vapi from "@vapi-ai/web";

type Assistant = Exclude<NonNullable<Parameters<Vapi["start"]>[0]>, string>;
export type Transcriber = NonNullable<Assistant["transcriber"]>;

/**
 * 한국어 STT 공급자 선택. 전부 Vapi 크레딧으로 쓰는 내장 공급자라 별도 키가 필요 없다.
 * provider·model·language 값은 설치된 SDK 타입(api.d.ts)에 있는 것만 쓴다.
 * NEXT_PUBLIC_VAPI_TRANSCRIBER: 11labs(기본) | openai | azure | deepgram
 */
export const TRANSCRIBER_CHOICES = ["11labs", "openai", "azure", "deepgram"] as const;
export type TranscriberChoice = (typeof TRANSCRIBER_CHOICES)[number];

export function resolveTranscriberChoice(raw: string | undefined): TranscriberChoice {
  const v = (raw ?? "").trim().toLowerCase();
  return (TRANSCRIBER_CHOICES as readonly string[]).includes(v) ? (v as TranscriberChoice) : "11labs";
}

export function buildTranscriber(choice: TranscriberChoice): Transcriber {
  switch (choice) {
    case "openai":
      return { provider: "openai", model: "gpt-4o-transcribe", language: "ko" };
    case "azure":
      return { provider: "azure", language: "ko-KR" };
    case "deepgram":
      return { provider: "deepgram", model: "nova-3", language: "ko" };
    case "11labs":
    default:
      return {
        provider: "11labs",
        model: "scribe_v2_realtime",
        language: "ko",
        // 11labs가 실패하면 OpenAI로 넘어간다
        fallbackPlan: { transcribers: [{ provider: "openai", model: "gpt-4o-transcribe", language: "ko" }] },
      };
  }
}
