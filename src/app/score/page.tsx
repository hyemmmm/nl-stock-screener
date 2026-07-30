"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Row {
  date: string;
  sessionDate: string;
  type: string;
  title: string;
  name: string;
  code: string;
  stratRet: number | null;
  maxUp: number | null;
  maxDown: number | null;
  closeRet: number | null;
  exit: string;
  detail: string;
}
interface RadarBoard {
  totalDays: number;
  scoredDays: number;
  pendingDays: number;
  winRate: number | null;
  avgStrat: number | null;
  tpRate: number | null;
  slRate: number | null;
  avgClose: number | null;
  byType: { type: string; n: number; upRate: number; avgOpen: number }[];
  rows: Row[];
  error?: string;
}

const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);
const cls = (x: number | null) => (x == null ? "text-zinc-500" : x >= 0 ? "text-up" : "text-down");
const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;
const md = (d: string) => d.slice(5);

export default function RadarScorePage() {
  const [b, setB] = useState<RadarBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/score", { cache: "no-store" });
      const j = await res.json();
      if (j.error) setError(j.error);
      else setB(j as RadarBoard);
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
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">레이더 성적표</h1>
          <p className="mt-2 text-sm text-zinc-400">
            매일 감지한 재료·관련주가 다음날 실제로 올랐는지 누적 채점 →{" "}
            <span className="text-zinc-600">내 전략 기준 (시가매수 → +3% 전량익절 / -5% 손절 / 종가청산)</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 내일 후보
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "채점 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {loading && !b && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          저장된 픽을 실제 등락으로 채점 중…
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}

      {b && b.totalDays === 0 && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          아직 저장된 픽이 없어요. <Link href="/" className="text-indigo-400">내일 후보</Link>를 매일 열면
          그날 재료가 저장되고, 다음날부터 여기서 채점 결과가 쌓여요.
        </div>
      )}

      {b && b.totalDays > 0 && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="전략 평균수익" value={pct(b.avgStrat)} valueClass={cls(b.avgStrat)} />
            <Stat label="승률" value={b.winRate == null ? "—" : `${b.winRate.toFixed(0)}%`} />
            <Stat label="+3% 터치율" value={b.tpRate == null ? "—" : `${b.tpRate.toFixed(0)}%`} valueClass="text-up" />
            <Stat label="-5% 손절률" value={b.slRate == null ? "—" : `${b.slRate.toFixed(0)}%`} valueClass="text-down" />
            <Stat label="채점/대기" value={`${b.scoredDays} / ${b.pendingDays}일`} />
          </div>

          {b.byType.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-zinc-300">재료 유형별 (시가매수 기준)</h2>
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
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">종목별 결과 (최신순)</h2>
            <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-ink-600">
                    <th className="px-3 py-2 text-left font-medium">감지일</th>
                    <th className="px-3 py-2 text-left font-medium">종목 / 재료</th>
                    <th className="px-2 py-2 text-right font-medium">고가/저가</th>
                    <th className="px-2 py-2 text-right font-medium">전략 수익</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, i) => (
                    <tr key={i} className="border-b border-ink-700/50 last:border-0 align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{md(r.date)}</td>
                      <td className="px-3 py-2">
                        <a href={naver(r.code)} target="_blank" rel="noreferrer" className="text-zinc-200 hover:text-white hover:underline">
                          {r.name}
                        </a>
                        <div className="mt-0.5 text-xs text-zinc-600">
                          <span className="mr-1 rounded bg-zinc-500/15 px-1 py-0.5 text-[10px] text-zinc-400">
                            {r.type}
                          </span>
                          {r.title.length > 26 ? r.title.slice(0, 26) + "…" : r.title}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-xs">
                        <span className={r.maxUp != null && r.maxUp >= 3 ? "font-bold text-up" : "text-up/70"}>
                          {pct(r.maxUp)}
                        </span>
                        <span className="text-zinc-600"> / </span>
                        <span className={r.maxDown != null && r.maxDown <= -5 ? "font-bold text-down" : "text-down/70"}>
                          {pct(r.maxDown)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <div className={`text-base font-bold ${cls(r.stratRet)}`}>{pct(r.stratRet)}</div>
                        {r.detail && (
                          <div className="text-[10px] font-normal text-zinc-500">{r.detail}</div>
                        )}
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
        전략 = 다음 거래일 시가 매수 → +3% 전량 익절 / -5% 손절 / 아니면 종가 청산 · 관련주 AI 추정 · 데이터는 매일 축적 · 참고용
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
