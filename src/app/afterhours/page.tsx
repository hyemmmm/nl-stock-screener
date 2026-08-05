"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AfterHoursResult, ThemeHeat, OverQuote } from "@/lib/afterhours";

const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;
const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;
const cls = (x: number) => (x > 0 ? "text-up" : x < 0 ? "text-down" : "text-zinc-500");

function Stock({ s }: { s: OverQuote }) {
  return (
    <a
      href={naver(s.code)}
      target="_blank"
      rel="noreferrer"
      className="flex items-baseline justify-between gap-2 rounded px-2 py-1 hover:bg-ink-700/50"
    >
      <span className="truncate text-xs text-zinc-300">{s.name}</span>
      <span className="shrink-0 text-xs tabular-nums">
        <b className={cls(s.overPct)}>{pct(s.overPct)}</b>
        <span className="ml-1.5 text-[10px] text-zinc-600">장중 {pct(s.dayPct)}</span>
      </span>
    </a>
  );
}

export default function AfterHoursPage() {
  const [data, setData] = useState<(AfterHoursResult & { error?: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyHot, setOnlyHot] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/afterhours", { cache: "no-store" });
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

  const themes: ThemeHeat[] = (data?.themes ?? []).filter(
    (t) => !onlyHot || t.verdict !== "⚪ 무의미",
  );
  const hot = (data?.themes ?? []).filter((t) => t.verdict === "🔥 섹터 시세");

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            🌙 시간외 테마 감지
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            한 종목이 아니라 <b className="text-zinc-200">섹터 전체</b>가 시간외에서 시세를 냈으면
            내일 그게 테마가 될 확률이 크다 — 그 폭(breadth)을 잰다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 내일 후보
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "스캔 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>
            {data.at} KST · 시간외 <b className="text-zinc-300">{data.session}</b>
          </span>
          <span>전 종목 스캔 → 시간외 시세 {data.scanned}종목</span>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}
      {data?.note && (
        <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {data.note}
        </p>
      )}
      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          전 종목 시간외 시세 스캔 중…
        </div>
      )}

      {data && (
        <>
          <div
            className={`mb-4 rounded-2xl border p-4 ${
              hot.length
                ? "border-up/40 bg-up/10"
                : "border-ink-600 bg-ink-800"
            }`}
          >
            {hot.length ? (
              <>
                <div className="text-sm font-bold text-up">
                  🔥 섹터 전체가 움직인 테마 {hot.length}개
                </div>
                <div className="mt-1 text-xs text-zinc-300">
                  {hot.map((t) => t.name).join(" · ")}
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  내일 시가가 <b className="text-zinc-300">시간외 상승폭보다 낮게</b> 열리면
                  거르는 건 직접 확인 — 그때는 다른 종목.
                </div>
              </>
            ) : (
              <div className="text-sm text-zinc-400">
                오늘 시간외엔 <b className="text-zinc-200">섹터 단위 시세가 없어요.</b> 개별 종목만
                움직였다면 규칙상 확률이 낮은 쪽입니다.
              </div>
            )}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              중앙값 기준 정렬 — 구성종목 <b className="text-zinc-400">절반 이상</b>이 올라야 올라감
            </p>
            <button
              onClick={() => setOnlyHot(!onlyHot)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                onlyHot
                  ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                  : "border-ink-600 bg-ink-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {onlyHot ? "의미있는 것만" : "전체 보기"}
            </button>
          </div>

          <div className="space-y-2">
            {themes.length === 0 ? (
              <div className="rounded-2xl border border-ink-600 bg-ink-800 p-8 text-center text-sm text-zinc-500">
                조건에 맞는 테마가 없어요.
              </div>
            ) : (
              themes.map((t) => (
                <div key={t.no} className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${t.no}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-white hover:underline"
                        >
                          {t.name}
                        </a>
                        <span className="text-[10px] text-zinc-600">
                          장중 <span className={cls(t.dayChg)}>{pct(t.dayChg)}</span>
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        구성 {t.n}종목 · 상승{" "}
                        <b className={t.upRate >= 60 ? "text-up" : "text-zinc-400"}>
                          {t.upRate.toFixed(0)}%
                        </b>{" "}
                        · +1%↑ <b className="text-zinc-300">{t.strongCount}개</b> · 중앙값{" "}
                        <b className={cls(t.medPct)}>{pct(t.medPct)}</b>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-bold">{t.verdict}</div>
                  </div>
                  <div className="mt-2 grid gap-0.5 border-t border-ink-700/50 pt-2 sm:grid-cols-2">
                    {t.stocks.slice(0, 8).map((s) => (
                      <Stock key={s.code} s={s} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {data.solo.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-zinc-300">
                개별 급등 (+2% 이상) — 참고용
              </h2>
              <p className="mb-2 text-xs text-zinc-500">
                섹터가 아니라 혼자 뛴 종목. 규칙상 확률이 낮은 쪽이지만 뭐가 움직였는지는 확인.
              </p>
              <div className="grid gap-0.5 rounded-2xl border border-ink-600 bg-ink-800 p-3 sm:grid-cols-2">
                {data.solo.map((s) => (
                  <Stock key={s.code} s={s} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        시간외 단일가 16:00~18:00 · 네이버가 시간외 <b>거래량</b>은 안 줘서 호가 허수는 못 걸러냄 ·
        <b> 시가 확인은 본인</b>
      </footer>
    </main>
  );
}
