"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DiscEvent {
  date: string;
  sessionDate: string;
  name: string;
  code: string;
  type: string;
  title: string;
  stratRet: number | null;
  maxUp: number | null;
  maxDown: number | null;
  closeRet: number | null;
  exit: string;
  hot: boolean;
  hotNote: string;
}
interface DiscBacktest {
  days: number;
  dates: string[];
  selected: string | null;
  scored: number;
  avgStrat: number | null;
  winRate: number | null;
  tpRate: number | null;
  slRate: number | null;
  avgClose: number | null;
  byType: { type: string; n: number; upRate: number; avgOpen: number }[];
  byHot: { label: string; n: number; upRate: number; avgOpen: number }[];
  hotThemes: { date: string; heads: string[] }[];
  events: DiscEvent[];
  error?: string;
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const dLabel = (ymd: string) => {
  const y = +ymd.slice(0, 4),
    m = +ymd.slice(4, 6),
    d = +ymd.slice(6, 8);
  return `${m}/${d}(${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};

const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);
const cls = (x: number | null) => (x == null ? "text-zinc-500" : x >= 0 ? "text-up" : "text-down");
const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;

export default function DiscBacktestPage() {
  const [b, setB] = useState<DiscBacktest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string>("all");

  async function load(date?: string) {
    setLoading(true);
    setError(null);
    try {
      const qs = date && date !== "all" ? `?date=${date}` : "";
      const res = await fetch(`/api/backtest${qs}`, { cache: "no-store" });
      const j = await res.json();
      if (j.error) setError(j.error);
      else setB(j as DiscBacktest);
    } catch {
      setError("불러오기 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">공시 백테스트</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {b?.selected ? (
              <>
                <span className="text-indigo-400">{dLabel(b.selected)} 공시</span>만
              </>
            ) : (
              <>최근 {b?.days ?? 6}일</>
            )}{" "}
            <span className="text-up">🔺호재 공시</span> → 다음 거래일{" "}
            <span className="text-indigo-400">내 전략</span>으로 채점 (시가 매수 → +3% 절반 익절 /
            -5% 손절 / 나머지 종가 청산).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 내일 후보
          </Link>
          <select
            value={sel}
            onChange={(e) => {
              setSel(e.target.value);
              load(e.target.value);
            }}
            disabled={loading}
            className="rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-indigo-500 disabled:opacity-50"
          >
            <option value="all">최근 6일 전체</option>
            {(b?.dates ?? []).map((d) => (
              <option key={d} value={d}>
                {dLabel(d)}
              </option>
            ))}
          </select>
          <button
            onClick={() => load(sel)}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "채점 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {loading && !b && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          최근 공시 긁고 실제 등락으로 채점 중… (약 5~10초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>
      )}

      {b && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="전략 평균수익"
              value={pct(b.avgStrat)}
              valueClass={cls(b.avgStrat)}
            />
            <Stat label="승률 (전략)" value={b.winRate == null ? "—" : `${b.winRate.toFixed(0)}%`} />
            <Stat
              label="+3% 터치율"
              value={b.tpRate == null ? "—" : `${b.tpRate.toFixed(0)}%`}
              valueClass="text-up"
            />
            <Stat
              label="-5% 손절률"
              value={b.slRate == null ? "—" : `${b.slRate.toFixed(0)}%`}
              valueClass="text-down"
            />
          </div>

          {b.byHot?.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-1 text-sm font-semibold text-zinc-300">
                시황(그날 부각) 일치 여부별
              </h2>
              <p className="mb-2 text-xs text-zinc-600">
                공시일에 그 종목이 특징주·테마 뉴스로 부각됐는지로 나눔 — 재료 + 시황이 같이 맞을 때 더
                먹히는지 검증
              </p>
              <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-ink-600">
                      <th className="px-4 py-2 text-left font-medium">구분</th>
                      <th className="px-4 py-2 text-right font-medium">건수</th>
                      <th className="px-4 py-2 text-right font-medium">적중률</th>
                      <th className="px-4 py-2 text-right font-medium">평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.byHot.map((g) => (
                      <tr key={g.label} className="border-b border-ink-700/50 last:border-0">
                        <td className="px-4 py-2 text-zinc-200">{g.label}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{g.n}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{g.upRate.toFixed(0)}%</td>
                        <td className={`px-4 py-2 text-right font-medium ${cls(g.avgOpen)}`}>
                          {pct(g.avgOpen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {b.byType.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-zinc-300">공시 유형별 (시가매수 기준)</h2>
              <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-ink-600">
                      <th className="px-4 py-2 text-left font-medium">유형</th>
                      <th className="px-4 py-2 text-right font-medium">건수</th>
                      <th className="px-4 py-2 text-right font-medium">적중률</th>
                      <th className="px-4 py-2 text-right font-medium">평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.byType.map((t) => (
                      <tr key={t.type} className="border-b border-ink-700/50 last:border-0">
                        <td className="px-4 py-2 text-zinc-200">{t.type}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{t.n}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{t.upRate.toFixed(0)}%</td>
                        <td className={`px-4 py-2 text-right font-medium ${cls(t.avgOpen)}`}>{pct(t.avgOpen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">공시별 결과 (최신순)</h2>
            <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-ink-600">
                    <th className="px-3 py-2 text-left font-medium">공시→반응</th>
                    <th className="px-3 py-2 text-left font-medium">종목 / 유형</th>
                    <th className="px-2 py-2 text-right font-medium">고가/저가</th>
                    <th className="px-2 py-2 text-right font-medium">종가</th>
                    <th className="px-2 py-2 text-right font-medium">전략</th>
                  </tr>
                </thead>
                <tbody>
                  {b.events.map((e, i) => (
                    <tr key={i} className="border-b border-ink-700/50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                        {e.date}
                        {e.sessionDate && <span className="text-zinc-600"> → {e.sessionDate}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <a href={naver(e.code)} target="_blank" rel="noreferrer" className="text-zinc-200 hover:text-white hover:underline">
                          {e.name}
                        </a>
                        <span className="ml-1.5 rounded bg-zinc-500/15 px-1 py-0.5 text-[10px] text-zinc-400">
                          {e.type}
                        </span>
                        {e.hot && (
                          <span
                            title={e.hotNote}
                            className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-300"
                          >
                            🔥 그날 부각
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-xs">
                        <span className={e.maxUp != null && e.maxUp >= 3 ? "font-bold text-up" : "text-up/70"}>
                          {pct(e.maxUp)}
                        </span>
                        <span className="text-zinc-600"> / </span>
                        <span
                          className={e.maxDown != null && e.maxDown <= -5 ? "font-bold text-down" : "text-down/70"}
                        >
                          {pct(e.maxDown)}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right text-xs ${cls(e.closeRet)}`}>
                        {pct(e.closeRet)}
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right font-medium ${cls(e.stratRet)}`}>
                        {pct(e.stratRet)}
                        {e.exit && <div className="text-[10px] font-normal text-zinc-600">{e.exit}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        호재 공시 다음 거래일 시가매수→종가 · 시장 급락일 포함 시 왜곡 · 표본 적음 · 참고용
      </footer>
    </main>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${valueClass ?? "text-white"}`}>{value}</div>
    </div>
  );
}
