"use client";

import { useEffect, useState } from "react";

type Health = {
  phoenix: { mode: "live" | "sample" | "error"; planLabel?: string; status?: string; used?: number; limit?: number; perMinute?: number; code?: string };
  vapi: boolean;
};

/** 하단 연결 상태. 키 값은 절대 보여주지 않고 연결 여부·사용량만 */
export function StatusBar() {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((j: Health) => alive && setH(j))
      .catch(() => alive && setH({ phoenix: { mode: "error", code: "FETCH" }, vapi: false }));
    return () => {
      alive = false;
    };
  }, []);

  const dot = (ok: boolean, warn = false) => (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green" : warn ? "bg-accent" : "bg-red"}`} aria-hidden />
  );

  if (!h) return <p className="text-center text-[11px] text-muted">연결 확인 중…</p>;

  const p = h.phoenix;
  const phoenixText =
    p.mode === "live"
      ? `Phoenix AI 연결됨${p.planLabel ? ` · ${p.planLabel}` : ""}${typeof p.used === "number" && typeof p.limit === "number" ? ` · 오늘 ${p.used.toLocaleString()}/${p.limit.toLocaleString()}회` : ""}`
      : p.mode === "sample"
        ? "Phoenix AI 키 없음 · 샘플 데이터"
        : `Phoenix AI 연결 실패 (${p.code ?? "?"})`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        {dot(p.mode === "live", p.mode === "sample")} {phoenixText}
      </span>
      <span className="flex items-center gap-1.5">
        {dot(h.vapi, !h.vapi)} {h.vapi ? "Vapi 음성 통화 준비됨" : "Vapi 키 없음 · 듣기 모드"}
      </span>
    </div>
  );
}
