"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Scoreboard } from "@/lib/track";

const HS = [1, 2, 3, 5];
const pct = (x: number | null | undefined) =>
  x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const cls = (x: number | null | undefined) =>
  x == null ? "text-zinc-500" : x >= 0 ? "text-up" : "text-down";

export default function TrackPage() {
  const [board, setBoard] = useState<Scoreboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/track", { cache: "no-store" });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setBoard(json as Scoreboard);
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
    <main className="mx-auto max-w-4xl px-5 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">예측 성적표</h1>
          <p className="mt-2 text-sm text-zinc-400">
            매일 예측한 이슈·관련주가 실제로 올랐는지 채점 →{" "}
            <span className="text-zinc-600">직전 마감가 대비 T+1~T+5 거래일 수익률</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/today" className="text-xs text-zinc-500 hover:text-zinc-300">
            오늘의 이슈 →
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

      {error && (
        <p className="rounded-xl border border-up/30 bg-up/10 p-4 text-sm text-up">{error}</p>
      )}

      {board && board.totalPredictions === 0 && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          아직 기록된 예측이 없어요. <Link href="/today" className="text-indigo-400">오늘의 이슈</Link>를 한 번 열면
          예측이 기록되고, 며칠 뒤부터 여기서 채점 결과를 볼 수 있어요.
        </div>
      )}

      {board && board.totalPredictions > 0 && (
        <>
          {/* 요약 카드 */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="적중률 (T+1)" value={board.hitRate == null ? "—" : `${(board.hitRate * 100).toFixed(0)}%`} />
            <Stat label="평균 수익 (T+1)" value={pct(board.avgRet[1])} valueClass={cls(board.avgRet[1])} />
            <Stat label="채점된 예측" value={`${board.scoredPredictions}일`} />
            <Stat label="채점 대기" value={`${board.pendingPredictions}일`} sub="T+1 미도래" />
          </div>

          {/* 테마별 성과 */}
          {board.byTheme.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-zinc-300">테마별 성과 (T+1 평균)</h2>
              <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-ink-600">
                      <th className="px-4 py-2 text-left font-medium">테마</th>
                      <th className="px-4 py-2 text-right font-medium">횟수</th>
                      <th className="px-4 py-2 text-right font-medium">적중률</th>
                      <th className="px-4 py-2 text-right font-medium">평균 수익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.byTheme.map((t) => (
                      <tr key={t.theme} className="border-b border-ink-700/50 last:border-0">
                        <td className="px-4 py-2 text-zinc-200">{t.theme}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{t.n}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">
                          {(t.hitRate * 100).toFixed(0)}%
                        </td>
                        <td className={`px-4 py-2 text-right font-medium ${cls(t.avgRet1)}`}>
                          {pct(t.avgRet1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 예측별 상세 */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">예측별 결과 (최신순)</h2>
            <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-ink-600">
                    <th className="px-4 py-2 text-left font-medium">날짜</th>
                    <th className="px-4 py-2 text-left font-medium">이슈 / 테마</th>
                    {HS.map((h) => (
                      <th key={h} className="px-3 py-2 text-right font-medium">
                        T+{h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r, i) => (
                    <tr key={i} className="border-b border-ink-700/50 last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                        {r.date.slice(4, 6)}/{r.date.slice(6, 8)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-zinc-200">{r.title}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {r.themeName} · 관련주 {r.nStocks}
                          {r.hit != null && (
                            <span className={`ml-2 ${r.hit ? "text-up" : "text-down"}`}>
                              {r.hit ? "적중" : "실패"}
                            </span>
                          )}
                        </div>
                      </td>
                      {HS.map((h) => (
                        <td
                          key={h}
                          className={`whitespace-nowrap px-3 py-3 text-right ${cls(r.ret[h])}`}
                        >
                          {pct(r.ret[h])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        수익률 = 직전 마감 종가 대비 · 데이터는 매일 앞으로 축적 · 참고용
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${valueClass ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-600">{sub}</div>}
    </div>
  );
}
