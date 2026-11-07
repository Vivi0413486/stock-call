"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";
import { Avatar, type AvatarState } from "./avatar";
import { fmtAsOf, fmtKrw, fmtPct } from "@/lib/format";
import { END_PHRASE, MAX_CALL_SECONDS, type CallScript, type Honorific } from "@/lib/prompt";
import type { StockBrief } from "@/lib/schema";
import type { Line } from "@/lib/storage";

type VapiAssistant = Exclude<NonNullable<Parameters<Vapi["start"]>[0]>, string>;
type VapiOverrides = NonNullable<Parameters<Vapi["start"]>[1]>;

export type CallResult = { lines: Line[]; durationSec: number; mode: "voice" | "listen"; failed?: string };

type Props = {
  brief: StockBrief;
  script: CallScript;
  honorific: Honorific;
  onEnd: (r: CallResult) => void;
};

type CallState = "connecting" | "live" | "ending" | "failed";

/** 문장부호·공백을 지우고 비교한다. LLM이 "다음에 또 전화할게!" 처럼 변형해도 잡기 위해 */
function norm(s: string) {
  return s.replace(/[\s,.!?~…'"]/g, "");
}

type VapiErrorPayload = { type?: string; stage?: string; error?: { message?: string }; errorMsg?: string; message?: string };
function describeError(e: unknown): string {
  const p = (typeof e === "object" && e ? e : {}) as VapiErrorPayload;
  if (p.type?.startsWith("microphone-preflight")) return "마이크 권한을 허용해야 통화할 수 있어요";
  return p.error?.message ?? p.errorMsg ?? p.message ?? "음성 연결 오류";
}

export function CallScreen({ brief, script, honorific, onEnd }: Props) {
  const hasVapi = Boolean(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY);
  const [state, setState] = useState<CallState>("connecting");
  const [avatar, setAvatar] = useState<AvatarState>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState<Line | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"voice" | "listen">(hasVapi ? "voice" : "listen");

  const vapiRef = useRef<Vapi | null>(null);
  const startPromiseRef = useRef<Promise<unknown> | null>(null);
  const linesRef = useRef<Line[]>([]);
  const elapsedRef = useRef(0);
  const finishedRef = useRef(false);
  const endTimerRef = useRef<number | null>(null);
  const modeRef = useRef<"voice" | "listen">(hasVapi ? "voice" : "listen");
  const scrollRef = useRef<HTMLDivElement>(null);

  /** start()가 끝나기 전에 stop()하면 통화가 고아로 남는다. 반드시 start 완료 후 stop */
  const teardown = useCallback(async () => {
    const v = vapiRef.current;
    vapiRef.current = null;
    if (endTimerRef.current) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (!v) return;
    try {
      await startPromiseRef.current?.catch(() => undefined);
      await v.stop();
    } catch {
      /* 이미 종료 */
    } finally {
      v.removeAllListeners();
      v.on("error", () => {}); // 리스너 없이 error가 emit되면 throw하므로
    }
  }, []);

  const finalize = useCallback(
    (failed?: string) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onEnd({ lines: linesRef.current, durationSec: elapsedRef.current, mode: modeRef.current, failed });
    },
    [onEnd],
  );

  const hangUp = useCallback(async () => {
    setState("ending");
    await teardown();
    finalize();
  }, [teardown, finalize]);

  // 화면 이탈 시 통화 정리
  useEffect(() => {
    const onLeave = () => void teardown();
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      void teardown();
    };
  }, [teardown]);

  // 타이머 + 브라우저 측 2분 상한 (서버 maxDurationSeconds가 1차, 이건 2차)
  useEffect(() => {
    if (state !== "live") return;
    const id = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_CALL_SECONDS) void hangUp();
    }, 1000);
    return () => window.clearInterval(id);
  }, [state, hangUp]);

  // 자막 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, partial]);

  const pushLine = useCallback((line: Line) => {
    const prev = linesRef.current[linesRef.current.length - 1];
    if (prev && prev.role === line.role && prev.text === line.text) return; // 재전송 중복 방지
    linesRef.current = [...linesRef.current, line];
    setLines(linesRef.current);
  }, []);

  /* ---------- 듣기 모드 (Vapi 키 없음): 브라우저 TTS로 첫 마디만 ---------- */
  const startListenMode = useCallback(() => {
    setState("live");
    pushLine({ role: "assistant", text: script.firstMessage });
    const synth = window.speechSynthesis;
    if (!synth) {
      setAvatar("listening");
      return;
    }
    const u = new SpeechSynthesisUtterance(script.firstMessage);
    u.lang = "ko-KR";
    u.rate = 1.05;
    u.pitch = script.persona.kind === "growth" ? 1.3 : 0.9;
    const ko = synth.getVoices().find((v) => v.lang.startsWith("ko"));
    if (ko) u.voice = ko;
    u.onstart = () => setAvatar("speaking");
    u.onend = () => setAvatar("listening");
    synth.cancel();
    synth.speak(u);
  }, [pushLine, script]);

  /* ---------- 음성 모드 (Vapi) ---------- */
  const startVoice = useCallback(async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!;
    await teardown();
    try {
      const { default: VapiCtor } = await import("@vapi-ai/web");
      const vapi = new VapiCtor(publicKey);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setState("live");
        setAvatar("listening");
      });
      vapi.on("speech-start", () => setAvatar("speaking"));
      vapi.on("speech-end", () => setAvatar("listening"));
      vapi.on("call-end", () => finalize());
      vapi.on("call-start-failed", (e: unknown) => {
        setError(describeError(e));
        setState("failed");
      });
      vapi.on("error", (e: unknown) => setError(describeError(e)));
      vapi.on("message", (m: unknown) => {
        const msg = m as { type?: string; role?: string; transcriptType?: string; transcript?: string };
        if (msg.type !== "transcript" || (msg.role !== "assistant" && msg.role !== "user") || !msg.transcript) return;
        const line: Line = { role: msg.role, text: msg.transcript.trim() };
        if (msg.transcriptType === "partial") {
          setPartial(line);
          return;
        }
        if (msg.transcriptType !== "final") return;
        setPartial(null);
        pushLine(line);
        // 캐릭터가 종료 문구를 말하면 2.5초 뒤 끊는다 (서버 endCallPhrases가 먼저 끊으면 call-end로 처리)
        if (line.role === "assistant" && norm(line.text).includes(norm(END_PHRASE)) && !endTimerRef.current) {
          endTimerRef.current = window.setTimeout(() => void hangUp(), 2500);
        }
      });

      const voiceId = process.env.NEXT_PUBLIC_VAPI_VOICE_ID || "sarah";
      const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
      let p: Promise<unknown>;
      if (assistantId) {
        // 대시보드 assistant를 쓸 때: 프롬프트에 {{systemPrompt}} 를 넣어 두면 치환된다
        const overrides: VapiOverrides = {
          firstMessage: script.firstMessage,
          variableValues: { systemPrompt: script.systemPrompt, honorific, stockName: brief.name },
          maxDurationSeconds: MAX_CALL_SECONDS,
          endCallPhrases: [END_PHRASE],
        };
        p = vapi.start(assistantId, overrides);
      } else {
        // 임시(transient) assistant. provider·model 값은 설치된 SDK 타입(api.d.ts)에 있는 것만 사용
        const assistant: VapiAssistant = {
          name: `${brief.name} 주식 캐릭터`,
          firstMessage: script.firstMessage,
          firstMessageMode: "assistant-speaks-first",
          transcriber: { provider: "deepgram", model: "nova-3", language: "ko" },
          model: {
            provider: "openai",
            model: "gpt-4o",
            temperature: 0.8,
            messages: [{ role: "system", content: script.systemPrompt }],
          },
          voice: { provider: "11labs", voiceId, model: "eleven_flash_v2_5", language: "ko", stability: 0.35, similarityBoost: 0.8 },
          maxDurationSeconds: MAX_CALL_SECONDS,
          endCallPhrases: [END_PHRASE],
        };
        p = vapi.start(assistant);
      }
      startPromiseRef.current = p;
      const result = await p;
      if (result === null && vapiRef.current === vapi) setState((s) => (s === "connecting" ? "failed" : s));
    } catch (e) {
      setState("failed");
      setError(e instanceof Error ? e.message : "음성 연결에 실패했어요");
    }
  }, [brief.name, honorific, script, teardown, finalize, hangUp, pushLine]);

  // 마운트 시 자동 시작 (받기 버튼이 사용자 제스처). 다음 틱에 시작해 StrictMode 이중 마운트에서도 한 번만 건다
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (hasVapi) void startVoice();
      else startListenMode();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    const next = !muted;
    vapiRef.current?.setMuted(next);
    setMuted(next);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const p = brief.price;
  const pct = p?.changePct ?? null;
  const colorCls = pct === null ? "text-muted" : pct > 0 ? "text-up" : pct < 0 ? "text-down" : "text-muted";

  return (
    <div className="flex min-h-[78dvh] flex-col gap-4">
      {/* 상단: 상대 정보 */}
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <Avatar emoji={script.persona.emoji} color={script.persona.color} state={state === "live" ? avatar : "idle"} />
        <div>
          <h2 className="text-2xl font-extrabold">{brief.name}</h2>
          <p className="text-sm text-muted">
            {state === "connecting" && "연결 중…"}
            {state === "live" && (
              <span className="font-mono">
                {mm}:{ss} / 02:00
              </span>
            )}
            {state === "ending" && "끊는 중…"}
            {state === "failed" && "연결 실패"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-panel px-2.5 py-1">
            {script.mood.emoji} {script.mood.label}
          </span>
          {p && (
            <span className={`rounded-full bg-panel px-2.5 py-1 font-mono ${colorCls}`}>
              {fmtKrw(p.current)} {pct !== null && fmtPct(pct)}
            </span>
          )}
          {script.pnl && (
            <span className={`rounded-full bg-panel px-2.5 py-1 font-mono ${script.pnl.pct > 0 ? "text-up" : script.pnl.pct < 0 ? "text-down" : ""}`}>
              내 수익률 {fmtPct(script.pnl.pct)}
            </span>
          )}
        </div>
        {p && (
          <p className="text-[11px] text-muted">
            {fmtAsOf(p.asOf, p.marketStatus)}
            {brief.source.quote === "sample" && " · 샘플 데이터"}
            {brief.source.quote === "phoenix" && " · Phoenix AI"}
          </p>
        )}
      </div>

      {/* 자막 */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-line bg-panel/70 p-4 text-[15px] leading-relaxed" aria-live="polite" style={{ maxHeight: "34dvh" }}>
        {lines.length === 0 && !partial && (
          <p className="text-sm text-muted">{state === "connecting" ? "전화 연결 중… (마이크 권한을 허용해 주세요)" : "…"}</p>
        )}
        {lines.map((l, i) => (
          <p key={i} className={`rise ${l.role === "user" ? "text-right text-muted" : ""}`}>
            <span className="mr-1.5 text-[11px] text-accent">{l.role === "assistant" ? brief.name : honorific === "형" ? "나" : "나"}</span>
            {l.text}
          </p>
        ))}
        {partial && (
          <p className={`opacity-60 ${partial.role === "user" ? "text-right" : ""}`}>
            <span className="mr-1.5 text-[11px] text-accent">{partial.role === "assistant" ? brief.name : "나"}</span>
            {partial.text}
          </p>
        )}
        {state === "live" && avatar === "speaking" && (
          <div className="wave flex h-4 items-end gap-0.5" aria-hidden>
            <span /><span /><span /><span /><span />
          </div>
        )}
      </div>

      {mode === "listen" && state === "live" && (
        <p className="text-center text-xs text-accent">Vapi 키가 없어 듣기 모드예요. 첫 마디만 브라우저 음성으로 들려줍니다.</p>
      )}
      {error && state === "live" && <p className="text-center text-xs text-red">{error}</p>}

      {/* 조작 */}
      {state === "failed" ? (
        <div className="rise space-y-3 rounded-2xl border border-red/50 bg-red/10 p-4 text-sm">
          <p className="font-semibold">통화 연결에 실패했어요</p>
          {error && <p className="text-muted">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => void startVoice()} className="rounded-xl border border-line px-4 py-2">
              다시 걸기
            </button>
            <button
              onClick={() => {
                modeRef.current = "listen";
                setMode("listen");
                setError(null);
                startListenMode();
              }}
              className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink"
            >
              듣기 모드로
            </button>
            <button onClick={() => finalize(error ?? "연결 실패")} className="ml-auto rounded-xl px-3 py-2 text-muted">
              그만
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-8 pb-2">
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleMute} disabled={state !== "live" || mode === "listen"} aria-label="음소거" className="flex h-14 w-14 items-center justify-center rounded-full bg-panel text-xl disabled:opacity-40">
              {muted ? "🔇" : "🎙️"}
            </button>
            <span className="text-[11px] text-muted">{muted ? "음소거 중" : "음소거"}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            {/* 연결 중엔 끊을 수 없다. start() 완료 전 stop은 통화를 고아로 만든다 */}
            <button onClick={() => void hangUp()} disabled={state !== "live"} aria-label="통화 종료" className="flex h-18 w-18 items-center justify-center rounded-full bg-red shadow-lg active:scale-95 disabled:opacity-40">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(135deg)" }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
            <span className="text-[11px] text-muted">끊기</span>
          </div>
        </div>
      )}
    </div>
  );
}
