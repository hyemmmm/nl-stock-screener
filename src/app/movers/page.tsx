"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Mover, MoversResult } from "@/lib/movers";

export default function MoversPage() {
  const [data, setData] = useState<MoversResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/movers", { cache: "no-store" });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json as MoversResult);
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
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">오늘의 특징주</h1>
          <p className="mt-2 text-sm text-zinc-400">
            <span className="text-rose-400">상한가</span> 또는{" "}
            <span className="text-indigo-400">거래량 1,000만주 이상</span> 종목(종가 기준) + 급등
            이유.{" "}
            <span className="text-zinc-600">순위(네이버) · 이유(구글뉴스)</span>
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
            {loading ? "수집 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          순위 훑고 종목별 뉴스 긁는 중… (약 5~10초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}
      {data && data.movers.length === 0 && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          조건에 맞는 종목이 없어요. (장중이면 종가 확정 후 다시 보세요)
        </div>
      )}

      <div className="space-y-3">
        {data?.movers.map((mv) => (
          <MoverRow key={mv.code} mv={mv} />
        ))}
      </div>

      <footer className="mt-10 text-center text-xs text-zinc-600">
        종가 기준 · 뉴스는 자동 매칭이라 종목과 무관할 수 있음 · 투자 판단은 직접 · 참고용
      </footer>
    </main>
  );
}

function MoverRow({ mv }: { mv: Mover }) {
  const up = mv.changePct >= 0;
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <a
              href={`https://finance.naver.com/item/main.naver?code=${mv.code}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-white hover:underline"
            >
              {mv.name}
            </a>
            {mv.tags.map((t) => (
              <span
                key={t}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  t === "상한가"
                    ? "bg-rose-500/15 text-rose-300"
                    : "bg-indigo-500/15 text-indigo-300"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            거래량 {(mv.volume / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}만주
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold text-white">{mv.close.toLocaleString()}</div>
          <div className={`text-sm font-medium ${up ? "text-up" : "text-down"}`}>
            {up ? "▲" : "▼"} {Math.abs(mv.changePct).toFixed(2)}%
          </div>
        </div>
      </div>

      {mv.news.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-ink-700/50 pt-3">
          {mv.news.map((n, i) => (
            <li key={i} className="text-sm leading-snug">
              <a
                href={n.link}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-300 hover:text-white hover:underline"
              >
                <span className="mr-1 text-zinc-600">›</span>
                {n.title}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 border-t border-ink-700/50 pt-3 text-xs text-zinc-600">
          최근 뉴스 매칭 실패
        </div>
      )}
    </div>
  );
}
