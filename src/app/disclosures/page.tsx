"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Disclosure {
  code: string;
  name: string;
  title: string;
  type: string;
  link: string;
}
interface DartResult {
  date: string;
  count: number;
  items: Disclosure[];
  error?: string;
}

const TYPE_COLOR: Record<string, string> = {
  "계약·수주": "bg-sky-500/15 text-sky-300",
  "임상·허가": "bg-fuchsia-500/15 text-fuchsia-300",
  "투자·M&A": "bg-emerald-500/15 text-emerald-300",
  "특허·기술": "bg-indigo-500/15 text-indigo-300",
  "증자·CB": "bg-amber-500/15 text-amber-300",
  자사주: "bg-teal-500/15 text-teal-300",
  "정부·국책": "bg-rose-500/15 text-rose-300",
};
const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;

export default function DisclosuresPage() {
  const [data, setData] = useState<DartResult | null>(null);
  const [filter, setFilter] = useState<string>("전체");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/disclosures", { cache: "no-store" });
      const json = (await res.json()) as DartResult;
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

  const types = useMemo(() => {
    const s = new Map<string, number>();
    for (const it of data?.items ?? []) s.set(it.type, (s.get(it.type) ?? 0) + 1);
    return [...s.entries()];
  }, [data]);
  const shown = (data?.items ?? []).filter((it) => filter === "전체" || it.type === filter);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">오늘의 공시 재료</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {data ? (
              <>
                <span className="text-indigo-400">{data.date}</span> 공시 중 재료성만 (계약·임상·투자
                등). <span className="text-zinc-600">DART · 종목코드 포함</span>
              </>
            ) : (
              <>오늘 올라온 공시 중 주가에 재료가 될 만한 것만 추려서 관련 종목과 함께.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/radar" className="text-xs text-zinc-500 hover:text-zinc-300">
            레이더 →
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
          오늘 공시 훑는 중…
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>
      )}

      {data && (
        <>
          {/* 유형 필터 */}
          <div className="mb-4 flex flex-wrap gap-2">
            <Chip active={filter === "전체"} onClick={() => setFilter("전체")}>
              전체 {data.items.length}
            </Chip>
            {types.map(([t, n]) => (
              <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
                {t} {n}
              </Chip>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
              재료성 공시가 없어요. (오늘 전체 공시 {data.count}건 중)
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-ink-600 bg-ink-800">
              {shown.map((it, i) => (
                <a
                  key={i}
                  href={it.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 border-b border-ink-700/50 px-4 py-3 last:border-0 hover:bg-ink-700/40"
                >
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      TYPE_COLOR[it.type] ?? "bg-zinc-500/15 text-zinc-400"
                    }`}
                  >
                    {it.type}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-zinc-200">{it.title}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {it.name} <span className="text-zinc-600">{it.code}</span>
                    </span>
                  </span>
                  <a
                    href={naver(it.code)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    차트 →
                  </a>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        DART 오늘 공시 · 공시 시각은 미제공(날짜만) · 증자 등은 악재일 수도 · 투자 판단은 직접 · 참고용
      </footer>
    </main>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
          : "border-ink-600 bg-ink-800 text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
