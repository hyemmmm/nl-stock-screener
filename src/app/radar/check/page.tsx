"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ValidatedStock {
  name: string;
  code: string;
  changePct: number | null;
  openBuyPct: number | null;
}
interface ValidatedCatalyst {
  title: string;
  type: string;
  sector: string;
  stocks: ValidatedStock[];
  link: string;
}
interface ValidateResult {
  forDate: string;
  since: string;
  catalysts: ValidatedCatalyst[];
  ready: boolean;
  error?: string;
}

const TYPE_COLOR: Record<string, string> = {
  "없다가 생김": "bg-emerald-500/15 text-emerald-300",
  "있다가 사라짐": "bg-rose-500/15 text-rose-300",
  "발생·확산": "bg-amber-500/15 text-amber-300",
  "정책·규제": "bg-indigo-500/15 text-indigo-300",
  "계약·수주": "bg-sky-500/15 text-sky-300",
  기타: "bg-zinc-500/15 text-zinc-400",
};
const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;
const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);
const cls = (x: number | null) => (x == null ? "text-zinc-500" : x >= 0 ? "text-up" : "text-down");

export default function RadarCheckPage() {
  const [data, setData] = useState<ValidateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/radar/check", { cache: "no-store" });
      const json = (await res.json()) as ValidateResult;
      if (json.error) setError(json.error);
      else setData(json);
    } catch {
      setError("불러오기 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  // 종합 통계
  const allStocks = data?.catalysts.flatMap((c) => c.stocks) ?? [];
  const changes = allStocks.map((s) => s.changePct).filter((x): x is number => x != null);
  const openBuys = allStocks.map((s) => s.openBuyPct).filter((x): x is number => x != null);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const upRate = changes.length ? Math.round((changes.filter((x) => x > 0).length / changes.length) * 100) : null;
  const avg = mean(changes);
  const avgOpen = mean(openBuys);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            어제 재료 → 오늘 결과
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {data ? (
              <>
                <span className="text-indigo-400">{data.since} 재료</span>가 오늘({data.forDate})
                실제로 올랐는지 종목별로 채점.
              </>
            ) : (
              <>어제 감지됐을 재료의 관련주가 오늘 실제로 어떻게 움직였는지.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/radar" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 레이더
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

      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          어제 재료 감지하고 오늘 종가로 채점 중… (약 15초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}

      {data && (
        <>
          {data.ready && upRate != null && (
            <div className="mb-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
                <div className="text-[11px] text-zinc-500">오른 종목 비율</div>
                <div className="mt-1 text-xl font-bold text-white">{upRate}%</div>
              </div>
              <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
                <div className="text-[11px] text-zinc-500">평균 · 전일 대비</div>
                <div className={`mt-1 text-xl font-bold ${cls(avg)}`}>{pct(avg)}</div>
              </div>
              <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
                <div className="text-[11px] text-zinc-500">평균 · 시가매수→종가</div>
                <div className={`mt-1 text-xl font-bold ${cls(avgOpen)}`}>{pct(avgOpen)}</div>
              </div>
            </div>
          )}
          {!data.ready && (
            <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              오늘 종가가 아직 없어요 (장 마감 후 다시 보세요).
            </p>
          )}

          {data.catalysts.length === 0 && !loading && (
            <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
              어제 감지된 재료가 없어요.
            </div>
          )}

          <div className="space-y-4">
            {data.catalysts.map((c, i) => (
              <div key={i} className="rounded-2xl border border-ink-600 bg-ink-800 p-5">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      TYPE_COLOR[c.type] ?? TYPE_COLOR["기타"]
                    }`}
                  >
                    {c.type}
                  </span>
                  {c.sector && <span className="text-xs text-zinc-500">{c.sector}</span>}
                </div>
                <h2 className="text-base font-semibold leading-snug text-white">
                  {c.link ? (
                    <a href={c.link} target="_blank" rel="noreferrer" className="hover:underline">
                      {c.title}
                    </a>
                  ) : (
                    c.title
                  )}
                </h2>

                <div className="mt-3 divide-y divide-ink-700/50 border-t border-ink-700/50">
                  {c.stocks.map((s) => (
                    <div key={s.code} className="flex items-center justify-between py-2">
                      <a
                        href={naver(s.code)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-zinc-200 hover:text-white hover:underline"
                      >
                        {s.name} <span className="text-xs text-zinc-600">{s.code}</span>
                      </a>
                      <div className="flex gap-5 text-right">
                        <div>
                          <div className="text-[10px] text-zinc-600">전일 대비</div>
                          <div className={`text-sm font-bold ${cls(s.changePct)}`}>
                            {pct(s.changePct)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-zinc-600">시가매수→종가</div>
                          <div className={`text-sm font-bold ${cls(s.openBuyPct)}`}>
                            {pct(s.openBuyPct)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        전일종가 대비 오늘 종가 · 관련주는 AI 추정 · 하루치 스냅샷이라 통계 아님 · 참고용
      </footer>
    </main>
  );
}
