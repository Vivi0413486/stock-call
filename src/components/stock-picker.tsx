"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";
import { HONORIFICS, type Honorific } from "@/lib/prompt";
import type { Position } from "@/lib/mood";
import type { SymbolHit } from "@/lib/schema";
import { QUICK_PICKS, personaFor, type Persona } from "@/lib/stocks";
import { loadPosition, savePosition, type CallRecord } from "@/lib/storage";

export type Pick = Pick_;
type Pick_ = { symbol: string; name: string; persona: Persona };

type Props = {
  honorific: Honorific;
  onHonorific: (h: Honorific) => void;
  history: CallRecord[];
  onCall: (pick: Pick_, pos: Position | null) => void;
  onOpenRecord: (rec: CallRecord) => void;
};

export function StockPicker({ honorific, onHonorific, history, onCall, onOpenRecord }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Pick_ | null>(null);
  const [avg, setAvg] = useState("");
  const [qty, setQty] = useState("");
  const timer = useRef<number | null>(null);
  const searchSeq = useRef(0);

  // 검색: 400ms 디바운스. 한도(분당 120회)를 아낀다. effect 대신 입력 핸들러에서 예약한다
  const onQuery = (value: string) => {
    setQ(value);
    if (timer.current) window.clearTimeout(timer.current);
    const term = value.trim();
    if (!term) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = window.setTimeout(async () => {
      const seq = ++searchSeq.current;
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const j = (await r.json()) as { hits: SymbolHit[] };
        if (seq !== searchSeq.current) return; // 늦게 온 옛 결과는 버린다
        setHits(j.hits ?? []);
      } catch {
        if (seq === searchSeq.current) setHits([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 400);
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const select = (symbol: string, name: string, rank: number | null = null) => {
    const persona = personaFor(symbol, name, rank);
    setSelected({ symbol, name, persona });
    const pos = loadPosition(symbol);
    setAvg(pos ? String(pos.avgPrice) : "");
    setQty(pos ? String(pos.quantity) : "");
  };

  const confirm = () => {
    if (!selected) return;
    const a = Number(avg.replace(/,/g, ""));
    const n = Number(qty.replace(/,/g, ""));
    const pos: Position | null = a > 0 && n > 0 ? { avgPrice: a, quantity: n } : null;
    savePosition(selected.symbol, pos); // 브라우저에만 저장
    onCall(selected, pos);
  };

  return (
    <div className="space-y-7">
      <header className="space-y-2 pt-2 text-center">
        <p className="text-xs tracking-[0.3em] text-muted">INCOMING CALL FROM YOUR PORTFOLIO</p>
        <h1 className="text-[26px] font-extrabold leading-tight">
          어느 날 내 주식이
          <br />
          전화했다
        </h1>
        <p className="text-sm text-muted">종목을 고르면 그 주식이 전화를 걸어 시세와 공시를 자기 사연처럼 털어놓습니다.</p>
      </header>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">누구한테 전화 받을까요?</h2>
          <div className="flex gap-1 rounded-full bg-panel p-0.5 text-[11px]">
            {HONORIFICS.map((h) => (
              <button
                key={h}
                onClick={() => onHonorific(h)}
                className={`rounded-full px-2 py-0.5 ${honorific === h ? "bg-accent font-bold text-accent-ink" : "text-muted"}`}
                aria-pressed={honorific === h}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {QUICK_PICKS.map((p) => (
            <button
              key={p.symbol}
              onClick={() => select(p.symbol, p.name)}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-panel px-1 py-3 transition hover:border-accent/60 hover:bg-bg-2 active:scale-95"
            >
              <Avatar emoji={p.emoji} color={p.color} state="idle" size="sm" />
              <span className="text-[11px] font-semibold leading-tight">{p.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="block text-sm font-semibold text-muted" htmlFor="q">
          다른 종목 찾기
        </label>
        <input
          id="q"
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="종목명 또는 코드 (예: 현대차, 005380)"
          className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm outline-none placeholder:text-muted/70 focus:border-accent"
          autoComplete="off"
        />
        {(hits.length > 0 || searching) && (
          <ul className="rise divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
            {searching && hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">찾는 중…</li>}
            {hits.map((h) => (
              <li key={h.symbol}>
                <button onClick={() => select(h.symbol, h.name)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-bg-2">
                  <span>
                    <span className="font-semibold">{h.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted">{h.symbol}</span>
                  </span>
                  <span className="text-xs text-muted">{[h.exchange, h.sector].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">최근 통화</h2>
          <ul className="space-y-1.5">
            {history.slice(0, 3).map((r) => (
              <li key={r.id}>
                <button onClick={() => onOpenRecord(r)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-left text-sm hover:bg-bg-2">
                  <span className="text-xl" aria-hidden>
                    {r.emoji}
                  </span>
                  <span className="flex-1">
                    <span className="font-semibold">{r.name}</span>
                    <span className="ml-2 text-xs text-muted">
                      {r.moodEmoji} {r.mood} · {Math.floor(r.durationSec / 60)}분 {r.durationSec % 60}초
                    </span>
                  </span>
                  <span className="text-xs text-muted">{new Date(r.startedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="rise w-full max-w-[430px] space-y-5 rounded-3xl border border-line bg-bg-2 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-center gap-3">
              <Avatar emoji={selected.persona.emoji} color={selected.persona.color} state="idle" size="sm" />
              <div>
                <p className="font-bold">{selected.name}</p>
                <p className="text-xs text-muted">
                  {selected.symbol} · {selected.persona.kind === "blue-chip" ? "대형주 · 듬직한 척" : "성장주 · 하이텐션"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted">내 포지션 (선택) — 입력하면 수익률을 캐릭터가 언급합니다. 브라우저에만 저장됩니다.</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-muted">
                  평단가 (원)
                  <input value={avg} onChange={(e) => setAvg(e.target.value)} inputMode="numeric" placeholder="예: 72000" className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent" />
                </label>
                <label className="block text-xs text-muted">
                  보유 수량 (주)
                  <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder="예: 10" className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent" />
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setSelected(null)} className="rounded-xl border border-line px-4 py-3 text-sm">
                취소
              </button>
              <button onClick={confirm} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-base font-bold text-accent-ink active:scale-[0.98]">
                📞 전화 오게 하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
