"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Session = "장전" | "장중" | "장후" | "휴장";
interface CatalystEvent {
  date: string;
  time: string;
  session: Session;
  title: string;
  link: string;
  game: string;
  closeReact: number | null;
  openBuy: number | null;
}
interface StockHistory {
  name: string;
  code: string;
  events: CatalystEvent[];
}
interface ScanResult {
  rule: string;
  today: { name: string; code: string; title: string; link: string; game: string }[];
  history: StockHistory[];
  error?: string;
}

const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);
const cls = (x: number | null) => (x == null ? "text-zinc-600" : x >= 0 ? "text-up" : "text-down");
const SESS_COLOR: Record<Session, string> = {
  장중: "bg-amber-500/15 text-amber-300",
  장후: "bg-indigo-500/15 text-indigo-300",
  장전: "bg-sky-500/15 text-sky-300",
  휴장: "bg-zinc-500/15 text-zinc-400",
};

export default function ScannerPage() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scanner", { cache: "no-store" });
      const json = (await res.json()) as ScanResult;
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
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">재료 스캐너</h1>
          <p className="mt-2 text-sm text-zinc-400">
            등록한 재료가 <span className="text-indigo-400">오늘 발동</span>했는지 매일 확인 + 과거에
            언제 나와서 어떻게 움직였는지.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/catalyst" className="text-xs text-zinc-500 hover:text-zinc-300">
            재료분석 →
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

      {/* 규칙 카드 */}
      <div className="mb-5 rounded-2xl border border-ink-600 bg-ink-800 p-4">
        <div className="text-[11px] text-zinc-500">규칙 1</div>
        <div className="text-base font-semibold text-white">게임주 — 신작 출시 소식</div>
        <div className="mt-1 text-xs text-zinc-500">
          대상: 넥슨게임즈·펄어비스·크래프톤·카카오게임즈·위메이드·네오위즈 · 키워드: 신작/출시/론칭/사전예약
        </div>
      </div>

      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          6종목 뉴스·주가 훑는 중… (약 10~20초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}

      {data && (
        <>
          {/* 오늘 발동 */}
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">🔔 오늘 발동</h2>
            {data.today.length === 0 ? (
              <div className="rounded-2xl border border-ink-600 bg-ink-800 p-5 text-center text-sm text-zinc-500">
                오늘(최근 3일)은 발동한 재료가 없어요.
              </div>
            ) : (
              <div className="space-y-2">
                {data.today.map((t) => (
                  <div
                    key={t.code}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"
                  >
                    <div className="text-sm font-semibold text-emerald-300">
                      {t.name}
                      {t.game && <span className="ml-2 text-xs text-emerald-400/80">🎮 {t.game}</span>}
                    </div>
                    <a
                      href={t.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-zinc-300 hover:underline"
                    >
                      › {t.title}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 종목별 과거 이벤트 */}
          <section>
            <h2 className="mb-1 text-sm font-semibold text-zinc-300">과거 이벤트 (종목별)</h2>
            <p className="mb-3 text-xs text-zinc-600">
              반응 = 발표 반응일 <b>전일종가 대비</b> · 시가매수 = 그날 <b>시가에 사서 종가</b>(네 방식)
            </p>
            <div className="space-y-6">
              {data.history.map((s) => (
                <div key={s.code}>
                  <div className="mb-1.5 text-sm font-semibold text-white">
                    {s.name} <span className="text-xs font-normal text-zinc-500">{s.code}</span>
                    <span className="ml-2 text-xs font-normal text-zinc-600">{s.events.length}건</span>
                  </div>
                  {s.events.length === 0 ? (
                    <div className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-xs text-zinc-600">
                      이벤트 없음
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-zinc-500">
                          <tr className="border-b border-ink-600">
                            <th className="px-3 py-2 text-left font-medium">날짜</th>
                            <th className="px-2 py-2 text-left font-medium">시각</th>
                            <th className="px-3 py-2 text-left font-medium">재료(헤드라인)</th>
                            <th className="px-2 py-2 text-right font-medium">반응</th>
                            <th className="px-2 py-2 text-right font-medium">시가매수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.events.map((e, i) => (
                            <tr key={i} className="border-b border-ink-700/50 last:border-0 align-top">
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-400">
                                {e.date.slice(5)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2">
                                <span
                                  className={`rounded px-1 py-0.5 text-[10px] ${SESS_COLOR[e.session]}`}
                                >
                                  {e.session}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {e.game && (
                                  <span className="mr-1.5 rounded bg-sky-500/15 px-1 py-0.5 text-[10px] text-sky-300">
                                    🎮 {e.game}
                                  </span>
                                )}
                                <a
                                  href={e.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-zinc-300 hover:text-white hover:underline"
                                >
                                  {e.title.length > 40 ? e.title.slice(0, 40) + "…" : e.title}
                                </a>
                              </td>
                              <td className={`whitespace-nowrap px-2 py-2 text-right ${cls(e.closeReact)}`}>
                                {pct(e.closeReact)}
                              </td>
                              <td className={`whitespace-nowrap px-2 py-2 text-right ${cls(e.openBuy)}`}>
                                {pct(e.openBuy)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        뉴스는 자동 매칭이라 종목과 무관할 수 있음 · 과거 반응이 미래를 보장하지 않음 · 참고용
      </footer>
    </main>
  );
}
