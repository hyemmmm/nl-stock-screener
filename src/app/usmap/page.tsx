"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { UsMapResult, UsMapRow, KrTheme } from "@/lib/usmap";

const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;
const themeUrl = (no: string) =>
  `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${no}`;
const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`);
const cls = (x: number | null) => (x == null ? "text-zinc-500" : x > 0 ? "text-up" : x < 0 ? "text-down" : "text-zinc-400");
const eok = (won: number) => (won >= 1e12 ? `${(won / 1e12).toFixed(1)}조` : `${Math.round(won / 1e8).toLocaleString()}억`);

// 과거 모드: 그날 시가에 샀으면 어땠나를 한 줄로
function StratLine({ k }: { k: KrTheme }) {
  const ss = k.stocks.filter((s) => s.strat != null);
  if (!ss.length) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const gap = avg(ss.map((s) => s.openPct ?? 0));
  const o2c = avg(ss.map((s) => s.o2c ?? 0));
  const st = avg(ss.map((s) => s.strat ?? 0));
  const win = (ss.filter((s) => (s.strat ?? 0) > 0).length / ss.length) * 100;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 rounded-lg bg-ink-800 px-2.5 py-1.5 text-[11px]">
      <span className="text-zinc-500">시가 매수 시</span>
      <span className="text-zinc-400">
        갭 <b className={cls(gap)}>{pct(gap)}</b>
      </span>
      <span className="text-zinc-400">
        시→종 <b className={cls(o2c)}>{pct(o2c)}</b>
      </span>
      <span className="text-zinc-400">
        전략 <b className={cls(st)}>{pct(st)}</b>
      </span>
      <span className="text-zinc-500">승률 {win.toFixed(0)}%</span>
    </div>
  );
}

function ThemeCard({ k }: { k: KrTheme }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <a
          href={themeUrl(k.no)}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-zinc-100 hover:underline"
        >
          {k.name}
        </a>
        <span className={`text-xs font-medium ${cls(k.chg)}`}>{pct(k.chg)}</span>
      </div>

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {k.big && (
          <div className="rounded-lg bg-ink-800 px-2.5 py-1.5">
            <div className="text-[10px] text-zinc-500">👑 대장주 (시총 1위)</div>
            <a
              href={naver(k.big.code)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-200 hover:underline"
            >
              {k.big.name} <b className={cls(k.big.pct)}>{pct(k.big.pct)}</b>
            </a>
            <div className="text-[10px] text-zinc-600">시총 {eok(k.big.mcap)}</div>
          </div>
        )}
        {k.leader && (
          <div className="rounded-lg bg-ink-800 px-2.5 py-1.5">
            <div className="text-[10px] text-zinc-500">🔥 오늘 주도주 (거래대금 상위 중)</div>
            <a
              href={naver(k.leader.code)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-200 hover:underline"
            >
              {k.leader.name} <b className={cls(k.leader.pct)}>{pct(k.leader.pct)}</b>
            </a>
            <div className="text-[10px] text-zinc-600">거래대금 {eok(k.leader.value)}</div>
          </div>
        )}
      </div>

      <StratLine k={k} />

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
        {k.stocks.slice(0, 8).map((s) => (
          <a
            key={s.code}
            href={naver(s.code)}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-zinc-400 hover:text-zinc-200"
            title={
              s.strat != null
                ? `갭 ${pct(s.openPct ?? 0)} · 시→종 ${pct(s.o2c ?? 0)} · 전략 ${pct(s.strat)}`
                : undefined
            }
          >
            {s.name} <span className={cls(s.pct)}>{pct(s.pct)}</span>
            {s.strat != null && (
              <span className={`ml-0.5 ${cls(s.strat)}`}>[{pct(s.strat)}]</span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function UsMapPage() {
  const [data, setData] = useState<(UsMapResult & { error?: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyUp, setOnlyUp] = useState(true);
  const [date, setDate] = useState(""); // "" = 최신(라이브)

  async function load(d = date) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usmap${d ? `?date=${d}` : ""}`, { cache: "no-store" });
      const j = await res.json();
      if (j.error) setError(j.error);
      else setData(j);
    } catch {
      setError("불러오기 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const rows: UsMapRow[] = (data?.rows ?? []).filter((r) => !onlyUp || (r.pct ?? -99) > 0);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            🇺🇸 미장 테마 지도
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            간밤 미국에서 뭐가 떴는지 → <b className="text-zinc-200">같은 테마의 국내 종목</b>과
            대장주·주도주.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 내일 후보
          </Link>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              setDate(e.target.value);
              load(e.target.value);
            }}
            disabled={loading}
            className="rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          {date && (
            <button
              onClick={() => {
                setDate("");
                load("");
              }}
              disabled={loading}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              최신으로
            </button>
          )}
          <button
            onClick={() => load()}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "수집 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {data && (
        <div className="mb-3 text-xs text-zinc-500">
          미국 <b className="text-zinc-300">{data.usDate}</b> 마감 · 국내{" "}
          <b className="text-zinc-300">{data.krDate}</b> 시세
        </div>
      )}

      {data?.past ? (
        (() => {
          const ss = data.rows.flatMap((r) => r.kr).flatMap((k) => k.stocks).filter((s) => s.strat != null);
          if (!ss.length) return null;
          const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
          const st = avg(ss.map((s) => s.strat!));
          const win = (ss.filter((s) => s.strat! > 0).length / ss.length) * 100;
          return (
            <div className="mb-4 rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-xs">
              <div className="mb-1 font-semibold text-zinc-200">
                📅 {data.usDate} 미장 → {data.krDate} 국내 · 그날 시가에 샀다면
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-400">
                <span>표본 {ss.length}종목</span>
                <span>
                  평균 갭 <b className={cls(avg(ss.map((s) => s.openPct!)))}>{pct(avg(ss.map((s) => s.openPct!)))}</b>
                </span>
                <span>
                  시→종 <b className={cls(avg(ss.map((s) => s.o2c!)))}>{pct(avg(ss.map((s) => s.o2c!)))}</b>
                </span>
                <span>
                  전략(+3/-5) <b className={cls(st)}>{pct(st)}</b> · 승률 {win.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1.5 text-[11px] text-zinc-600">{data.note}</div>
            </div>
          );
        })()
      ) : (
        <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200/80">
          검증 결과: 미장 테마가 국내로 이어질 확률은 80~90%지만{" "}
          <b>그 연동은 대부분 시가 갭에서 끝난다.</b> 매수 신호가 아니라 지도로 쓸 것.
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}
      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          미국 테마 ETF + 국내 테마 시세 수집 중…
        </div>
      )}

      {data && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-zinc-500">미국 등락률 순</p>
            <button
              onClick={() => setOnlyUp(!onlyUp)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                onlyUp
                  ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                  : "border-ink-600 bg-ink-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {onlyUp ? "오른 것만" : "전체 보기"}
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.sym} className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-bold text-white">{r.label}</span>
                  <span className={`text-sm font-bold ${cls(r.pct)}`}>{pct(r.pct)}</span>
                  <span className="text-[10px] text-zinc-600">중앙값</span>
                  {r.date && r.date !== data.usDate && (
                    <span className="text-[10px] text-amber-400/70">{r.date} 기준</span>
                  )}
                </div>
                <div className="mb-2 flex flex-wrap gap-x-2.5 gap-y-0.5">
                  {r.tickers.map((t) => (
                    <span key={t.sym} className="text-[11px] text-zinc-500">
                      {t.sym} <span className={cls(t.pct)}>{pct(t.pct)}</span>
                    </span>
                  ))}
                </div>
                {r.kr.length === 0 ? (
                  <p className="text-xs text-zinc-600">매칭되는 국내 테마가 없어요.</p>
                ) : (
                  <div className="space-y-2">
                    {r.kr.map((k) => (
                      <ThemeCard key={k.no} k={k} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        미국 = 테마 대표 ETF 등락률 · 국내 = 네이버 테마 · 대장주는 시총, 주도주는 거래대금 상위 중
        등락률 1위
      </footer>
    </main>
  );
}
