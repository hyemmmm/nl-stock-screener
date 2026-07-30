"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Repeat {
  episodes: number;
  scored: number;
  upRate: number | null;
  avg: number | null;
  lastYmd: string | null;
}
interface Candidate {
  source: "뉴스" | "공시";
  title: string;
  type: string;
  stage: string;
  why: string;
  stocks: {
    name: string;
    code: string;
    bigVol?: boolean;
    via?: "AI" | "테마";
    chg?: number | null;
    reason?: string;
  }[];
  repeat: Repeat;
  freshness: string;
  verdict: string;
  themeName: string | null;
  themeChg: number | null;
  score: number;
}
interface TomorrowResult {
  forDate: string;
  since: string;
  kospiPct: number | null;
  topThemes: { name: string; chg: number }[];
  candidates: Candidate[];
  rejected: Candidate[];
  error?: string;
}

const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;
const TYPE_COLOR: Record<string, string> = {
  "없다가 생김": "bg-emerald-500/15 text-emerald-300",
  "있다가 사라짐": "bg-rose-500/15 text-rose-300",
  "발생·확산": "bg-amber-500/15 text-amber-300",
  "정책·규제": "bg-indigo-500/15 text-indigo-300",
  "계약·수주": "bg-sky-500/15 text-sky-300",
};

export default function TomorrowPage() {
  const [data, setData] = useState<TomorrowResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tomorrow", { cache: "no-store" });
      const json = (await res.json()) as TomorrowResult;
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

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            📌 내일 시가 후보
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {data ? (
              <>
                <span className="text-indigo-400">{data.since} 이후</span> 뉴스·공시 재료 →
                반복성·신선도로 걸러 다음 거래일 후보. <b className="text-zinc-300">결정은 직접.</b>
              </>
            ) : (
              <>장마감 후 재료를 반복성·신선도·시황으로 걸러 다음 거래일 후보를 대령.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/score" className="text-xs text-indigo-400 hover:text-indigo-300">
            성적표 →
          </Link>
          <Link href="/backtest" className="text-xs text-zinc-500 hover:text-zinc-300">
            공시 백테스트 →
          </Link>
          <Link href="/movers" className="text-xs text-zinc-500 hover:text-zinc-300">
            특징주 →
          </Link>
          <Link href="/catalyst" className="text-xs text-zinc-500 hover:text-zinc-300">
            재료분석 →
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "분석 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {/* 시황 게이트 */}
      {data?.kospiPct != null && (
        <div
          className={`mb-5 rounded-xl border p-3 text-sm ${
            data.kospiPct <= -2
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : data.kospiPct < 0
                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          시황: 오늘 코스피 {data.kospiPct >= 0 ? "+" : ""}
          {data.kospiPct.toFixed(2)}%
          {data.kospiPct <= -2 && " — 급락장 익일. 재료보다 시장이 셀 수 있음, 갭·변동성 주의"}
          {data.kospiPct > -2 && data.kospiPct < 0 && " — 약세. 재료 반응 약할 수 있음"}
          {data.kospiPct >= 0 && " — 우호적"}
        </div>
      )}

      {/* 오늘 부각 테마 (시황) */}
      {data && data.topThemes.length > 0 && (
        <div className="mb-5 rounded-xl border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm">
          <span className="mr-2 text-xs text-zinc-500">오늘 부각 테마</span>
          {data.topThemes.map((t, i) => (
            <span key={t.name} className="mr-3 whitespace-nowrap">
              <span className="text-zinc-300">{t.name}</span>{" "}
              <span className={t.chg >= 0 ? "text-up" : "text-down"}>
                {t.chg >= 0 ? "+" : ""}
                {t.chg.toFixed(1)}%
              </span>
              {i < data.topThemes.length - 1 && <span className="ml-3 text-zinc-700">·</span>}
            </span>
          ))}
        </div>
      )}

      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          뉴스·공시 재료 모으고 과거 반응 채점 중… (약 30~60초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}

      {data && data.candidates.length === 0 && !loading && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          오늘은 통과한 재료가 없어요. (장 마감 후 저녁에 다시 열어보세요)
        </div>
      )}

      {/* 후보 */}
      <div className="space-y-4">
        {data?.candidates.map((c, i) => (
          <div key={i} className="rounded-2xl border border-ink-600 bg-ink-800 p-5">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-indigo-400">#{i + 1}</span>
              <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {c.source}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  TYPE_COLOR[c.type] ?? "bg-zinc-500/15 text-zinc-400"
                }`}
              >
                {c.type}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  c.stage === "확정" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {c.stage}
              </span>
              <span className="text-[11px] text-zinc-500">{c.freshness}</span>
              {c.themeChg != null && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    c.themeChg >= 2
                      ? "bg-up/15 text-up"
                      : c.themeChg >= 0
                        ? "bg-zinc-500/15 text-zinc-300"
                        : "bg-down/15 text-down"
                  }`}
                >
                  테마 {c.themeName} {c.themeChg >= 0 ? "+" : ""}
                  {c.themeChg.toFixed(1)}%
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold leading-snug text-white">{c.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{c.why}</p>
            <p className="mt-2 rounded-lg bg-ink-900/50 px-3 py-2 text-sm text-zinc-300">
              📊 {c.verdict}
              {c.repeat.scored > 0 && (
                <span className="ml-1 text-xs text-zinc-500">(표본 {c.repeat.scored}건)</span>
              )}
            </p>
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] text-zinc-500">
                관련주 {c.stocks.length}
                <span className="ml-1 text-zinc-600">(진한=AI 지목 · 흐린=테마 구성종목)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.stocks.map((s) => (
                  <a
                    key={s.code}
                    href={naver(s.code)}
                    target="_blank"
                    rel="noreferrer"
                    title={s.reason || undefined}
                    className={`rounded-md border px-2 py-0.5 text-[12px] transition-colors hover:border-indigo-500 hover:text-white ${
                      s.via === "테마" ? "border-ink-700 text-zinc-500" : "border-ink-500 text-zinc-200"
                    }`}
                  >
                    {s.name}
                    {s.chg != null && (
                      <span className={`ml-1 ${s.chg >= 0 ? "text-up" : "text-down"}`}>
                        {s.chg >= 0 ? "+" : ""}
                        {s.chg.toFixed(1)}%
                      </span>
                    )}
                    {s.bigVol && (
                      <span title="최근 거래량 1,000만주+ 이력" className="ml-1 text-amber-400">
                        ⚡
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 거른 것 */}
      {data && data.rejected.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">❌ 거른 재료</h2>
          <div className="space-y-2">
            {data.rejected.map((c, i) => (
              <div key={i} className="rounded-xl border border-ink-700 bg-ink-800/60 p-3 text-sm">
                <span className="text-zinc-400">{c.title}</span>
                <span className="ml-2 text-xs text-zinc-600">— {c.verdict}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        후보 = 판단 재료 제공이지 매수 추천 아님 · ⚡ = 최근 거래량 1,000만주+ 이력(참고용, 필터 아님) ·
        반복성 표본 작음 · 관련주 AI 추정 · 결정과 책임은 본인
      </footer>
    </main>
  );
}
