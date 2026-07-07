"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DailyIssue } from "@/lib/issues";

export default function TodayPage() {
  const [issues, setIssues] = useState<DailyIssue[] | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/today", { cache: "no-store" });
      const json = (await res.json()) as {
        since?: string;
        issues?: DailyIssue[];
        error?: string;
      };
      if (json.error) setError(json.error);
      else {
        setSince(json.since ?? null);
        setIssues(json.issues ?? []);
      }
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
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            오늘의 이슈 &amp; 관련주
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {since ? (
              <>
                <span className="text-indigo-400">{since} 장마감 이후</span> 뉴스만 반영 → 내일 장
                재료.{" "}
              </>
            ) : (
              <>뉴스에서 핵심 이슈 2개를 뽑아 관련주까지 자동으로. </>
            )}
            <span className="text-zinc-600">뉴스(구글) · 테마(네이버) · 선정(Groq)</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 스크리너
          </Link>
          <Link href="/track" className="text-xs text-zinc-500 hover:text-zinc-300">
            성적표 →
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

      {loading && !issues && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          뉴스 읽고 이슈 뽑는 중… (약 10초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-up/30 bg-up/10 p-4 text-sm text-up">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {issues?.map((iss, i) => (
          <div key={i} className="rounded-2xl border border-ink-600 bg-ink-800 p-5">
            <div className="mb-1 text-[11px] font-medium text-indigo-400">이슈 {i + 1}</div>
            <h2 className="text-lg font-semibold leading-snug text-white">{iss.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{iss.why}</p>

            <div className="mt-4 flex items-center gap-2">
              <span className="rounded-md bg-ink-600 px-2 py-0.5 text-xs font-medium text-zinc-200">
                {iss.themeName}
              </span>
              {iss.themeChg != null && (
                <span
                  className={`text-xs font-medium ${iss.themeChg >= 0 ? "text-up" : "text-down"}`}
                >
                  {iss.themeChg >= 0 ? "▲" : "▼"} {Math.abs(iss.themeChg).toFixed(2)}%
                </span>
              )}
            </div>

            <div className="mt-3">
              <div className="mb-1.5 text-[11px] text-zinc-500">관련주 {iss.stocks.length}</div>
              <div className="flex flex-wrap gap-1.5">
                {iss.stocks.map((s) => (
                  <a
                    key={s.code}
                    href={`https://finance.naver.com/item/main.naver?code=${s.code}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-ink-500 px-2 py-0.5 text-[12px] text-zinc-200 transition-colors hover:border-indigo-500 hover:text-white"
                  >
                    {s.name}
                  </a>
                ))}
                {iss.stocks.length === 0 && (
                  <span className="text-xs text-zinc-600">관련주 매칭 실패</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-10 text-center text-xs text-zinc-600">
        자동 큐레이션 · 투자 판단은 직접 · 테마주는 변동성 큼
      </footer>
    </main>
  );
}
