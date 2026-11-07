"use client";

import { useState } from "react";
import { Avatar } from "./avatar";
import { fmtAsOf, fmtDateKo, fmtEok, fmtKrw, fmtPct } from "@/lib/format";
import type { CallRecord } from "@/lib/storage";

type Props = {
  record: CallRecord;
  onAgain: () => void;
  onHome: () => void;
};

function summaryText(r: CallRecord): string {
  const p = r.brief.price;
  const head = `📞 ${r.name}한테 전화 왔다 (${new Date(r.startedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })})`;
  const price = p ? `${r.moodEmoji} ${r.mood} · ${fmtKrw(p.current)} ${p.changePct !== null ? fmtPct(p.changePct) : ""} (${fmtAsOf(p.asOf, p.marketStatus)})` : `${r.moodEmoji} ${r.mood} · 시세 없음`;
  const discl = r.brief.disclosures.map((d) => `· ${fmtDateKo(d.filedDate)} ${d.title}`).join("\n");
  const first = r.lines.find((l) => l.role === "assistant")?.text ?? "";
  return [head, price, discl, first ? `"${first}"` : "", "— 어느 날 내 주식이 전화했다 · 데이터: Phoenix AI"].filter(Boolean).join("\n");
}

/** 통화 끝난 뒤 남는 기록 카드. 데이터 출처·기준 시각을 그대로 보여준다 */
export function CallCard({ record: r, onAgain, onHome }: Props) {
  const [copied, setCopied] = useState(false);
  const p = r.brief.price;
  const pct = p?.changePct ?? null;
  const colorCls = pct === null ? "" : pct > 0 ? "text-up" : pct < 0 ? "text-down" : "";
  const src = r.brief.source;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText(r));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 불가 환경 */
    }
  };

  return (
    <div className="rise space-y-5">
      <div className="flex items-center gap-3">
        <Avatar emoji={r.emoji} color={r.color} state="done" size="sm" />
        <div className="flex-1">
          <p className="text-xs text-muted">통화 기록</p>
          <h2 className="text-xl font-extrabold">{r.name}</h2>
        </div>
        <div className="text-right text-xs text-muted">
          <p>{new Date(r.startedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
          <p>
            {Math.floor(r.durationSec / 60)}분 {r.durationSec % 60}초 · {r.mode === "voice" ? "음성" : "듣기"}
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">기분</span>
          <span className="text-lg font-bold">
            {r.moodEmoji} {r.mood}
          </span>
        </div>
        {p ? (
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">{fmtAsOf(p.asOf, p.marketStatus)}</span>
            <span className={`font-mono text-lg font-bold ${colorCls}`}>
              {fmtKrw(p.current)} {pct !== null && <span className="text-sm">{fmtPct(pct)}</span>}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted">시세를 가져오지 못했어요</p>
        )}
        {r.pnlPct !== null && (
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">{r.honorific}의 수익률</span>
            <span className={`font-mono font-bold ${r.pnlPct > 0 ? "text-up" : r.pnlPct < 0 ? "text-down" : ""}`}>{fmtPct(r.pnlPct)}</span>
          </div>
        )}
        {r.brief.earnings && (
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">
              {r.brief.earnings.period} {r.brief.earnings.account}
              {r.brief.earnings.preliminary && " (잠정)"}
            </span>
            <span className="font-mono font-bold">{fmtEok(r.brief.earnings.value, r.brief.earnings.unit)}</span>
          </div>
        )}
        {r.brief.disclosures.length > 0 && (
          <div>
            <p className="mb-1 text-sm text-muted">얘가 말한 공시</p>
            <ul className="space-y-1 text-sm">
              {r.brief.disclosures.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-mono text-xs text-muted">{fmtDateKo(d.filedDate)}</span>
                  {d.url && /^https?:\/\//.test(d.url) ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-accent">
                      {d.title}
                    </a>
                  ) : (
                    <span>{d.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-muted">
          출처: {src.quote === "phoenix" || src.disclosures === "phoenix" ? "Phoenix AI (알프소프트)" : src.quote === "sample" ? "샘플 데이터 (키 없음)" : "없음"} · 투자 권유 아님
        </p>
      </section>

      {r.lines.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-line bg-panel p-4 text-sm leading-relaxed">
          <p className="text-xs text-muted">대화</p>
          {r.lines.map((l, i) => (
            <p key={i} className={l.role === "user" ? "text-right text-muted" : ""}>
              <span className="mr-1.5 text-[11px] text-accent">{l.role === "assistant" ? r.name : "나"}</span>
              {l.text}
            </p>
          ))}
        </section>
      )}

      <div className="flex gap-2">
        <button onClick={onHome} className="rounded-xl border border-line px-4 py-3 text-sm">
          다른 종목
        </button>
        <button onClick={copy} className="rounded-xl border border-line px-4 py-3 text-sm">
          {copied ? "복사됨 ✓" : "기록 복사"}
        </button>
        <button onClick={onAgain} className="flex-1 rounded-xl bg-accent py-3 font-bold text-accent-ink">
          📞 다시 전화 받기
        </button>
      </div>
    </div>
  );
}
