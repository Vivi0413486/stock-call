"use client";

import { useCallback, useRef, useState } from "react";
import { CallCard } from "@/components/call-card";
import { CallScreen, type CallResult } from "@/components/call-screen";
import { IncomingCall } from "@/components/incoming-call";
import { StockPicker, type Pick } from "@/components/stock-picker";
import type { Position } from "@/lib/mood";
import { buildScript, type CallScript, type Honorific } from "@/lib/prompt";
import { StockBrief } from "@/lib/schema";
import { loadHistory, loadHonorific, loadPosition, pushHistory, saveHonorific, type CallRecord } from "@/lib/storage";
import { personaFor } from "@/lib/stocks";

type Stage =
  | { kind: "pick" }
  | { kind: "ringing"; pick: Pick; pos: Position | null; brief: StockBrief | null; note: string | null }
  | { kind: "live"; pick: Pick; pos: Position | null; brief: StockBrief; script: CallScript; startedAt: string }
  | { kind: "ended"; record: CallRecord };

/** 시세 조회가 통째로 실패해도 전화는 와야 한다. 시세 없는 최소 재료 */
function emptyBrief(pick: Pick): StockBrief {
  return {
    symbol: pick.symbol,
    name: pick.name,
    exchange: null,
    sector: null,
    price: null,
    disclosures: [],
    earnings: null,
    source: { quote: "error", disclosures: "error", earnings: "error" },
    fetchedAt: new Date().toISOString(),
  };
}

export function App() {
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  // ssr 없이 마운트되므로 localStorage를 초기값으로 바로 읽어도 hydration 불일치가 없다
  const [honorific, setHonorific] = useState<Honorific>(() => loadHonorific());
  const [history, setHistory] = useState<CallRecord[]>(() => loadHistory());
  /** 거절 뒤 같은 종목을 다시 울릴 때 옛 fetch 결과가 새 벨을 채우지 않게 */
  const ringSeq = useRef(0);

  const changeHonorific = (h: Honorific) => {
    setHonorific(h);
    saveHonorific(h);
  };

  /** 전화 오게 하기: 벨이 울리는 동안 서버에서 시세·공시·실적을 모은다 */
  const ring = useCallback(async (pick: Pick, pos: Position | null) => {
    const seq = ++ringSeq.current;
    setStage({ kind: "ringing", pick, pos, brief: null, note: null });
    let brief: StockBrief;
    let note: string | null = null;
    try {
      const r = await fetch(`/api/stock/${pick.symbol}?name=${encodeURIComponent(pick.name)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const parsed = StockBrief.safeParse(await r.json());
      if (!parsed.success) throw new Error("응답 형식 불일치");
      brief = parsed.data;
      if (!brief.price) note = "시세를 못 가져와서 등락률 없이 통화해요";
      else if (brief.source.quote === "sample") note = "샘플 데이터로 통화해요 (Phoenix 키 없음)";
    } catch {
      brief = emptyBrief(pick);
      note = "데이터 서버 연결 실패 — 시세 없이 통화해요";
    }
    if (seq !== ringSeq.current) return; // 그 사이 거절했거나 다른 벨이 울렸다
    setStage((s) => (s.kind === "ringing" && s.pick.symbol === pick.symbol ? { ...s, brief, note } : s));
  }, []);

  const accept = () => {
    if (stage.kind !== "ringing" || !stage.brief) return;
    const script = buildScript(stage.brief, honorific, stage.pos);
    setStage({ kind: "live", pick: stage.pick, pos: stage.pos, brief: stage.brief, script, startedAt: new Date().toISOString() });
  };

  const end = (res: CallResult) => {
    if (stage.kind !== "live") return;
    const { script, brief, pick } = stage;
    const record: CallRecord = {
      id: `${Date.now()}`,
      symbol: brief.symbol,
      name: brief.name,
      emoji: pick.persona.emoji,
      color: pick.persona.color,
      startedAt: stage.startedAt,
      durationSec: res.durationSec,
      mood: script.mood.label,
      moodEmoji: script.mood.emoji,
      honorific,
      lines: res.lines,
      brief,
      pnlPct: script.pnl?.pct ?? null,
      mode: res.mode,
    };
    if (!res.failed && res.lines.length > 0) {
      pushHistory(record);
      setHistory(loadHistory());
    }
    setStage({ kind: "ended", record });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-6 pt-5 md:my-6 md:min-h-[860px] md:rounded-[44px] md:border md:border-white/10 md:bg-bg-2/60 md:px-6 md:shadow-2xl">
      <div className="flex-1">
        {stage.kind === "pick" && (
          <StockPicker
            honorific={honorific}
            onHonorific={changeHonorific}
            history={history}
            onCall={(pick, pos) => void ring(pick, pos)}
            onOpenRecord={(record) => setStage({ kind: "ended", record })}
          />
        )}
        {stage.kind === "ringing" && (
          <IncomingCall
            name={stage.pick.name}
            persona={stage.pick.persona}
            ready={stage.brief !== null}
            note={stage.note}
            onAccept={accept}
            onDecline={() => setStage({ kind: "pick" })}
          />
        )}
        {stage.kind === "live" && <CallScreen key={stage.startedAt} brief={stage.brief} script={stage.script} honorific={honorific} onEnd={end} />}
        {stage.kind === "ended" && (
          <CallCard
            record={stage.record}
            onHome={() => setStage({ kind: "pick" })}
            onAgain={() => {
              const r = stage.record;
              void ring({ symbol: r.symbol, name: r.name, persona: personaFor(r.symbol, r.name, r.brief.price?.marketCapRank ?? null) }, loadPosition(r.symbol));
            }}
          />
        )}
      </div>
    </main>
  );
}
