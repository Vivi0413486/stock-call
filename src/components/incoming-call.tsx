"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "./avatar";
import { startRingtone } from "@/lib/ringtone";
import type { Persona } from "@/lib/stocks";

type Props = {
  name: string;
  persona: Persona;
  /** 데이터가 준비됐는지. 준비 전엔 받기 버튼이 잠깐 기다린다 */
  ready: boolean;
  note: string | null;
  onAccept: () => void;
  onDecline: () => void;
};

/** 휴대폰 수신 화면. 벨은 WebAudio로 울리고, 화면을 떠나면 꺼진다 */
export function IncomingCall({ name, persona, ready, note, onAccept, onDecline }: Props) {
  const ring = useRef<ReturnType<typeof startRingtone>>(null);
  useEffect(() => {
    ring.current = startRingtone();
    if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400]);
    return () => ring.current?.stop();
  }, []);

  return (
    <div className="flex flex-col items-center gap-12 py-6 text-center">
      <div className="space-y-1">
        <p className="text-sm text-muted">수신 전화</p>
        <p className="text-xs text-muted/70">{persona.kind === "blue-chip" ? "코스피 대형주" : "성장주"} · {persona.symbol}</p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <Avatar emoji={persona.emoji} color={persona.color} state="ringing" />
        <div>
          <h2 className="text-3xl font-extrabold">{name}</h2>
          <p className="mt-1 text-sm text-muted">{ready ? "받을 준비 됐어요" : "오늘 시세·공시 챙겨오는 중…"}</p>
          {note && <p className="mt-1 text-xs text-accent">{note}</p>}
        </div>
      </div>

      <div className="flex w-full items-center justify-around pt-4">
        <div className="flex flex-col items-center gap-2">
          <button onClick={onDecline} aria-label="거절" className="flex h-18 w-18 items-center justify-center rounded-full bg-red text-3xl shadow-lg active:scale-95">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(135deg)" }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
          <span className="text-xs text-muted">거절</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onAccept}
            disabled={!ready}
            aria-label="받기"
            className={`flex h-18 w-18 items-center justify-center rounded-full bg-green text-3xl shadow-lg active:scale-95 disabled:opacity-50 ${ready ? "ring-shake" : ""}`}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
          <span className="text-xs text-muted">{ready ? "받기" : "준비 중"}</span>
        </div>
      </div>
    </div>
  );
}
