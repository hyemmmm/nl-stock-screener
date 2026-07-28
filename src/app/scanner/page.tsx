"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Session = "장전" | "장중" | "장후" | "휴장";
interface GameEvent {
  date: string;
  time: string;
  session: Session;
  title: string;
  link: string;
  game: string;
  closeReact: number | null;
  openBuy: number | null;
}
interface GameResult {
  rule: string;
  today: { name: string; code: string; title: string; link: string; game: string }[];
  history: { name: string; code: string; events: GameEvent[] }[];
}
interface BioEvent {
  company: string;
  code: string;
  phase: string;
  stage: string;
  date: string;
  time: string;
  session: Session;
  title: string;
  link: string;
  closeReact: number | null;
  openBuy: number | null;
}
interface BioResult {
  rule: string;
  today: BioEvent[];
  events: BioEvent[];
}
interface ScanResponse {
  game: GameResult;
  bio: BioResult;
  error?: string;
}

const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`);
const cls = (x: number | null) => (x == null ? "text-zinc-600" : x >= 0 ? "text-up" : "text-down");
const SESS: Record<Session, string> = {
  장중: "bg-amber-500/15 text-amber-300",
  장후: "bg-indigo-500/15 text-indigo-300",
  장전: "bg-sky-500/15 text-sky-300",
  휴장: "bg-zinc-500/15 text-zinc-400",
};
const naver = (code: string) => `https://finance.naver.com/item/main.naver?code=${code}`;

export default function ScannerPage() {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scanner", { cache: "no-store" });
      const json = (await res.json()) as ScanResponse;
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

      {loading && !data && (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-10 text-center text-sm text-zinc-500">
          뉴스·주가 훑고 재료 판별 중… (약 15~30초)
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </p>
      )}

      {data && (
        <div className="space-y-10">
          {/* ── 규칙 1: 게임주 신작 ── */}
          <section>
            <RuleHead
              n={1}
              title="게임주 — 신작 출시 소식"
              sub="대상: 넥슨게임즈·펄어비스·크래프톤·카카오게임즈·위메이드·네오위즈 · 처음 언급되는 신작만"
            />
            <TodayBox count={data.game.today.length}>
              {data.game.today.map((t) => (
                <HitCard key={t.code} href={t.link} title={t.title}>
                  <a href={naver(t.code)} target="_blank" rel="noreferrer" className="hover:underline">
                    {t.name}
                  </a>
                  {t.game && <span className="ml-2 text-xs text-emerald-400/80">🎮 {t.game}</span>}
                </HitCard>
              ))}
            </TodayBox>

            <h3 className="mb-1 mt-4 text-sm font-semibold text-zinc-300">과거 데뷔 게임 (종목별)</h3>
            <ReactNote />
            <div className="space-y-5">
              {data.game.history.map((s) => (
                <div key={s.code}>
                  <div className="mb-1.5 text-sm font-semibold text-white">
                    {s.name} <span className="text-xs font-normal text-zinc-600">{s.events.length}건</span>
                  </div>
                  {s.events.length === 0 ? (
                    <div className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-xs text-zinc-600">
                      데뷔 게임 없음
                    </div>
                  ) : (
                    <EventTable
                      headers={["날짜", "세션", "게임 / 재료", "반응", "시가매수"]}
                      rows={s.events.map((e) => ({
                        c1: e.date.slice(5),
                        session: e.session,
                        main: (
                          <>
                            {e.game && (
                              <span className="mr-1.5 rounded bg-sky-500/15 px-1 py-0.5 text-[10px] text-sky-300">
                                🎮 {e.game}
                              </span>
                            )}
                            <a href={e.link} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white hover:underline">
                              {e.title.length > 34 ? e.title.slice(0, 34) + "…" : e.title}
                            </a>
                          </>
                        ),
                        closeReact: e.closeReact,
                        openBuy: e.openBuy,
                      }))}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── 규칙 2: 바이오 FDA 임상 ── */}
          <section>
            <RuleHead
              n={2}
              title="바이오주 — FDA 임상 진입 (국내)"
              sub="국내 상장 바이오·제약사가 미국 FDA에 임상 1/2/3상 신청(IND) 또는 승인 · 회사→종목 자동 매칭"
            />
            <TodayBox count={data.bio.today.length}>
              {data.bio.today.map((e, i) => (
                <HitCard key={i} href={e.link} title={e.title}>
                  <a href={naver(e.code)} target="_blank" rel="noreferrer" className="hover:underline">
                    {e.company}
                  </a>
                  <span className="ml-2 text-xs text-emerald-400/80">
                    🧬 {e.phase} {e.stage}
                  </span>
                </HitCard>
              ))}
            </TodayBox>

            <h3 className="mb-1 mt-4 text-sm font-semibold text-zinc-300">과거 이벤트 (최신순)</h3>
            <ReactNote />
            {data.bio.events.length === 0 ? (
              <div className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-xs text-zinc-600">
                이벤트 없음
              </div>
            ) : (
              <EventTable
                headers={["날짜", "세션", "회사 / 임상", "반응", "시가매수"]}
                rows={data.bio.events.map((e) => ({
                  c1: e.date.slice(5),
                  session: e.session,
                  main: (
                    <>
                      <a href={naver(e.code)} target="_blank" rel="noreferrer" className="font-medium text-white hover:underline">
                        {e.company}
                      </a>
                      <span className="ml-1.5 rounded bg-fuchsia-500/15 px-1 py-0.5 text-[10px] text-fuchsia-300">
                        🧬 {e.phase} {e.stage}
                      </span>
                      <a href={e.link} target="_blank" rel="noreferrer" className="ml-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:underline">
                        기사
                      </a>
                    </>
                  ),
                  closeReact: e.closeReact,
                  openBuy: e.openBuy,
                }))}
              />
            )}
          </section>
        </div>
      )}

      <footer className="mt-10 text-center text-xs text-zinc-600">
        뉴스·회사 자동 매칭이라 오류 가능 · 과거 반응이 미래를 보장하지 않음 · 참고용
      </footer>
    </main>
  );
}

function RuleHead({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-3 rounded-2xl border border-ink-600 bg-ink-800 p-4">
      <div className="text-[11px] text-zinc-500">규칙 {n}</div>
      <div className="text-base font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}
function TodayBox({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-300">🔔 오늘 발동 ({count})</h3>
      {count === 0 ? (
        <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4 text-center text-sm text-zinc-500">
          오늘(최근) 발동한 재료가 없어요.
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}
function HitCard({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
      <div className="text-sm font-semibold text-emerald-300">{children}</div>
      <a href={href} target="_blank" rel="noreferrer" className="text-sm text-zinc-300 hover:underline">
        › {title}
      </a>
    </div>
  );
}
function ReactNote() {
  return (
    <p className="mb-2 text-xs text-zinc-600">
      반응 = 발표 반응일 <b>전일종가 대비</b> · 시가매수 = 그날 <b>시가에 사서 종가</b>(네 방식)
    </p>
  );
}
function EventTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: { c1: string; session: Session; main: React.ReactNode; closeReact: number | null; openBuy: number | null }[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-600 bg-ink-800">
      <table className="w-full text-sm">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-ink-600">
            {headers.map((h, i) => (
              <th key={i} className={`px-3 py-2 font-medium ${i >= 3 ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-ink-700/50 last:border-0 align-top">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-400">{r.c1}</td>
              <td className="whitespace-nowrap px-2 py-2">
                <span className={`rounded px-1 py-0.5 text-[10px] ${SESS[r.session]}`}>{r.session}</span>
              </td>
              <td className="px-3 py-2">{r.main}</td>
              <td className={`whitespace-nowrap px-2 py-2 text-right ${cls(r.closeReact)}`}>{pct(r.closeReact)}</td>
              <td className={`whitespace-nowrap px-2 py-2 text-right ${cls(r.openBuy)}`}>{pct(r.openBuy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
