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
interface CandStock {
  name: string;
  code: string;
  bigVol?: boolean;
  via?: "AI" | "테마";
  chg?: number | null;
  reason?: string;
}
interface Candidate {
  source: "뉴스" | "공시";
  title: string;
  type: string;
  stage: string;
  why: string;
  stocks: CandStock[];
  repeat: Repeat;
  freshness: string;
  verdict: string;
  themeName: string | null;
  themeChg: number | null;
  link?: string;
  score: number;
}
interface DiscFeedItem {
  name: string;
  code: string;
  title: string;
  type: string;
  dir: "호재" | "악재" | "중립";
  link: string;
  repeat?: Repeat;
  verdict?: string;
  mcap?: number | null;
  mcapLabel?: string;
}
interface NewsFeedItem {
  title: string;
  link: string;
  time: string;
  aiTag?: string;
  noise?: boolean;
  strong?: boolean;
}
interface TomorrowResult {
  forDate: string;
  since: string;
  kospiPct: number | null;
  topThemes: { name: string; chg: number }[];
  candidates: Candidate[];
  discFeed: DiscFeedItem[];
  newsFeed: NewsFeedItem[];
  note?: string | null;
  builtAt?: string;
  cached?: boolean;
  error?: string;
}

const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;
const DIR_COLOR = {
  호재: "bg-up/15 text-up",
  악재: "bg-down/15 text-down",
  중립: "bg-zinc-500/15 text-zinc-400",
} as const;

export default function HomePage() {
  const [data, setData] = useState<TomorrowResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"공시" | "뉴스" | "AI">("공시");
  const [dirFilter, setDirFilter] = useState<"전체" | "호재" | "악재">("호재");
  const [showNoise, setShowNoise] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tomorrow${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
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

  const disc = (data?.discFeed ?? []).filter((d) => dirFilter === "전체" || d.dir === dirFilter);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            📌 내일 시가 후보
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {data ? (
              <>
                <span className="text-indigo-400">{data.since} 이후</span> 나온 공시·뉴스 재료{" "}
                <b className="text-zinc-300">전부</b>. 걸러내지 않고 링크까지 — 판단은 직접.
              </>
            ) : (
              <>장마감 이후 나온 공시·뉴스 재료를 전부 모아 링크와 과거 반응을 함께 보여줍니다.</>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/score" className="text-xs text-indigo-400 hover:text-indigo-300">
            성적표 →
          </Link>
          <Link href="/backtest" className="text-xs text-zinc-500 hover:text-zinc-300">
            백테스트 →
          </Link>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "수집 중…" : "다시 뽑기"}
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        {data?.builtAt && (
          <span>
            {data.cached ? "📌 저장된 오늘 결과" : "🆕 방금 수집"} ·{" "}
            {new Date(data.builtAt).toLocaleString("ko-KR", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        {data?.kospiPct != null && (
          <span>
            코스피{" "}
            <b className={data.kospiPct >= 0 ? "text-up" : "text-down"}>
              {data.kospiPct >= 0 ? "+" : ""}
              {data.kospiPct.toFixed(2)}%
            </b>
            {data.kospiPct <= -2 && " (급락 익일 — 변동성 주의)"}
          </span>
        )}
        {data?.topThemes?.length ? (
          <span>
            부각 테마:{" "}
            {data.topThemes.slice(0, 4).map((t, i) => (
              <span key={t.name}>
                {i > 0 && " · "}
                <span className="text-zinc-300">{t.name}</span>{" "}
                <span className={t.chg >= 0 ? "text-up" : "text-down"}>
                  {t.chg >= 0 ? "+" : ""}
                  {t.chg.toFixed(1)}%
                </span>
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {data?.note && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          ⚠️ {data.note}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}
      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          공시·뉴스 재료 모으고 과거 반응 채점 중… (약 30~60초)
        </div>
      )}

      {data && (
        <>
          {/* 탭 */}
          <div className="mb-3 flex gap-2">
            <Tab active={tab === "공시"} onClick={() => setTab("공시")}>
              📃 공시 {data.discFeed.length}
            </Tab>
            <Tab active={tab === "뉴스"} onClick={() => setTab("뉴스")}>
              📰 뉴스 {data.newsFeed.length}
            </Tab>
            <Tab active={tab === "AI"} onClick={() => setTab("AI")}>
              🤖 AI 정리 {data.candidates.length}
            </Tab>
          </div>

          {/* 공시 목록 */}
          {tab === "공시" && (
            <>
              <p className="mb-2 text-xs text-zinc-500">시가총액 큰 순 정렬</p>
              <div className="mb-2 flex gap-2">
                {(["호재", "악재", "전체"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirFilter(d)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      dirFilter === d
                        ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                        : "border-ink-600 bg-ink-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {d === "호재" ? "🔺 호재" : d === "악재" ? "🔻 악재" : "전체"}{" "}
                    {d === "전체"
                      ? data.discFeed.length
                      : data.discFeed.filter((x) => x.dir === d).length}
                  </button>
                ))}
              </div>
              {disc.length === 0 ? (
                <Empty>해당 공시가 없어요.</Empty>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-ink-600 bg-ink-800">
                  {disc.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 border-b border-ink-700/50 px-4 py-3 last:border-0"
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${DIR_COLOR[d.dir]}`}
                      >
                        {d.dir === "호재" ? "🔺" : d.dir === "악재" ? "🔻" : "–"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <a
                            href={naver(d.code)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-white hover:underline"
                          >
                            {d.name}
                          </a>
                          <span className="text-[10px] text-zinc-600">{d.code}</span>
                          {d.mcapLabel && (
                            <span className="rounded bg-ink-700 px-1 py-0.5 text-[10px] text-zinc-300">
                              시총 {d.mcapLabel}
                            </span>
                          )}
                          <span className="rounded bg-zinc-500/15 px-1 py-0.5 text-[10px] text-zinc-400">
                            {d.type}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm text-zinc-300">{d.title}</div>
                        {d.verdict && (
                          <div className="mt-1 text-xs text-zinc-500">📊 {d.verdict}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        <a
                          href={d.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          공시 원문 ↗
                        </a>
                        <a
                          href={naver(d.code)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-500 hover:text-zinc-300"
                        >
                          차트 ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 뉴스 목록 */}
          {tab === "뉴스" && (
            <>
              {(() => {
                const noiseCount = data.newsFeed.filter((n) => n.noise).length;
                return noiseCount > 0 ? (
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">
                      AI 주목 🤖 → 재료성 → 나머지 순. 지역행사·인사 등 {noiseCount}건은 숨김.
                    </span>
                    <button
                      onClick={() => setShowNoise(!showNoise)}
                      className="rounded-full border border-ink-600 bg-ink-800 px-3 py-1 text-zinc-400 hover:text-zinc-200"
                    >
                      {showNoise ? "잡음 숨기기" : `잡음도 보기 (${noiseCount})`}
                    </button>
                  </div>
                ) : null;
              })()}
              {data.newsFeed.length === 0 ? (
                <Empty>장마감 이후 재료성 뉴스가 없어요.</Empty>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-ink-600 bg-ink-800">
                  {data.newsFeed
                    .filter((n) => showNoise || !n.noise)
                    .map((n, i) => (
                    <a
                      key={i}
                      href={n.link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-3 border-b border-ink-700/50 px-4 py-2.5 last:border-0 hover:bg-ink-700/40"
                    >
                      <span className="mt-0.5 shrink-0 text-[11px] tabular-nums text-zinc-600">
                        {n.time}
                      </span>
                      <span
                        className={`min-w-0 flex-1 text-sm ${
                          n.noise ? "text-zinc-600" : n.strong ? "text-zinc-100" : "text-zinc-300"
                        }`}
                      >
                        {n.title}
                      </span>
                      {n.aiTag && (
                        <span className="shrink-0 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300">
                          🤖 {n.aiTag}
                        </span>
                      )}
                    </a>
                    ))}
                </div>
              )}
            </>
          )}

          {/* AI 정리 */}
          {tab === "AI" && (
            <>
              <p className="mb-2 text-xs text-zinc-500">
                AI가 재료를 정리하고 과거 반응을 붙인 것 — <b>참고용</b>. 놓친 게 있을 수 있으니 위
                공시·뉴스 목록도 직접 훑어보세요.
              </p>
              {data.candidates.length === 0 ? (
                <Empty>AI 정리 결과가 없어요 (목록 탭을 보세요).</Empty>
              ) : (
                <div className="space-y-3">
                  {data.candidates.map((c, i) => (
                    <div key={i} className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="font-bold text-indigo-400">#{i + 1}</span>
                        <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-zinc-400">
                          {c.source}
                        </span>
                        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">
                          {c.type}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 ${
                            c.stage === "확정"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-amber-500/15 text-amber-300"
                          }`}
                        >
                          {c.stage}
                        </span>
                        <span className="text-zinc-500">{c.freshness}</span>
                        {c.themeChg != null && (
                          <span
                            className={`rounded px-1.5 py-0.5 ${
                              c.themeChg >= 2 ? "bg-up/15 text-up" : "bg-zinc-500/15 text-zinc-300"
                            }`}
                          >
                            {c.themeName} {c.themeChg >= 0 ? "+" : ""}
                            {c.themeChg.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <h2 className="text-sm font-semibold leading-snug text-white">
                        {c.link ? (
                          <a href={c.link} target="_blank" rel="noreferrer" className="hover:underline">
                            {c.title}
                            <span className="ml-1.5 text-xs font-normal text-indigo-400">
                              {c.source === "공시" ? "공시 원문 ↗" : "기사 ↗"}
                            </span>
                          </a>
                        ) : (
                          c.title
                        )}
                      </h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        📊 {c.verdict}
                        {c.repeat.scored > 0 && ` (표본 ${c.repeat.scored}건)`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.stocks.map((s) => (
                          <a
                            key={s.code}
                            href={naver(s.code)}
                            target="_blank"
                            rel="noreferrer"
                            title={s.reason || undefined}
                            className={`rounded-md border px-2 py-0.5 text-[12px] transition-colors hover:border-indigo-500 hover:text-white ${
                              s.via === "테마"
                                ? "border-ink-700 text-zinc-500"
                                : "border-ink-500 text-zinc-200"
                            }`}
                          >
                            {s.name}
                            {s.chg != null && (
                              <span className={`ml-1 ${s.chg >= 0 ? "text-up" : "text-down"}`}>
                                {s.chg >= 0 ? "+" : ""}
                                {s.chg.toFixed(1)}%
                              </span>
                            )}
                            {s.bigVol && <span className="ml-1 text-amber-400">⚡</span>}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        재료 목록은 걸러내지 않고 전부 노출 · 📊 = 같은 유형 과거 공시의 다음날 시가매수 결과 · ⚡ =
        최근 거래량 1,000만주+ · 매수 추천 아님, 판단과 책임은 본인
      </footer>
    </main>
  );
}

function Tab({
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
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-indigo-500 bg-indigo-500/15 font-medium text-indigo-200"
          : "border-ink-600 bg-ink-800 text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
