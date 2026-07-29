"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface RadarStock {
  name: string;
  code: string;
}
interface Catalyst {
  title: string;
  type: string;
  why: string;
  sector: string;
  stocks: RadarStock[];
  link: string;
}
interface RadarResult {
  since: string;
  catalysts: Catalyst[];
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

export default function RadarPage() {
  const [data, setData] = useState<RadarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/radar", { cache: "no-store" });
      const json = (await res.json()) as RadarResult;
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
            📡 오늘의 재료 레이더
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {data?.since ? (
              <>
                <span className="text-indigo-400">{data.since} 장마감 이후</span> — 오늘 새로 생긴
                재료를 감지해 내일 오를 후보를 띄웁니다.
              </>
            ) : (
              <>어제까지 없던, 오늘 새로 생긴/사라진 재료를 감지 → 관련주까지.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/radar/check" className="text-xs text-indigo-400 hover:text-indigo-300">
            어제 결과 검증 →
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "감지 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          오늘 뉴스에서 새 재료 감지 중… (약 10초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}
      {data && data.catalysts.length === 0 && !loading && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          오늘은 감지된 새 재료가 없어요. (장 마감 후 다시 보세요)
        </div>
      )}

      <div className="space-y-4">
        {data?.catalysts.map((c, i) => (
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
            <h2 className="text-lg font-semibold leading-snug text-white">
              {c.link ? (
                <a href={c.link} target="_blank" rel="noreferrer" className="hover:underline">
                  {c.title}
                </a>
              ) : (
                c.title
              )}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{c.why}</p>

            <div className="mt-3">
              <div className="mb-1.5 text-[11px] text-zinc-500">관련주 {c.stocks.length}</div>
              <div className="flex flex-wrap gap-1.5">
                {c.stocks.map((s) => (
                  <a
                    key={s.code}
                    href={naver(s.code)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-ink-500 px-2 py-0.5 text-[12px] text-zinc-200 transition-colors hover:border-indigo-500 hover:text-white"
                  >
                    {s.name}
                  </a>
                ))}
                {c.stocks.length === 0 && (
                  <span className="text-xs text-zinc-600">관련 상장사 매칭 실패</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-10 text-center text-xs text-zinc-600">
        새로 생긴 재료 = 서프라이즈라 선반영이 덜 됨 · 관련주는 AI 추정이라 무관할 수 있음 · 투자 판단은
        직접 · 참고용
      </footer>
    </main>
  );
}
