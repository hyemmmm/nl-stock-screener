import { SNAPSHOT } from "@/data/snapshot";
import { generateCandles } from "@/lib/candles";
import type { Candle } from "@/lib/types";

// ──────────────────────────────────────────────────────────────────────────
// KIS Open API client.
//
// All KIS calls happen here, server-side only — the app key/secret never
// reach the browser. If keys are missing we transparently return deterministic
// mock candles so the app works out of the box.
// ──────────────────────────────────────────────────────────────────────────

function kisConfigured(): boolean {
  return Boolean(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET);
}

function baseUrl(): string {
  return process.env.KIS_USE_SIMULATION === "false"
    ? "https://openapi.koreainvestment.com:9443"
    : "https://openapivts.koreainvestment.com:29443";
}

// Access tokens are valid ~24h; cache in module memory to avoid re-issuing
// (KIS rate-limits token issuance aggressively).
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const res = await fetch(`${baseUrl()}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KIS token failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 86400) * 1000,
  };
  return cachedToken.value;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchKisCandles(code: string): Promise<Candle[]> {
  const token = await getAccessToken();
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 200);

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: formatDate(start),
    FID_INPUT_DATE_2: formatDate(end),
    FID_PERIOD_DIV_CODE: "D", // daily
    FID_ORG_ADJ_PRC: "0", // adjusted price
  });

  const res = await fetch(
    `${baseUrl()}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: process.env.KIS_APP_KEY!,
        appsecret: process.env.KIS_APP_SECRET!,
        tr_id: "FHKST03010100",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`KIS chart failed: ${res.status}`);
  const json = (await res.json()) as {
    output2?: Array<{
      stck_bsop_date: string;
      stck_oprc: string;
      stck_hgpr: string;
      stck_lwpr: string;
      stck_clpr: string;
      acml_vol: string;
    }>;
  };

  const rows = json.output2 ?? [];
  return rows
    .filter((r) => r.stck_bsop_date)
    .map((r) => ({
      time: `${r.stck_bsop_date.slice(0, 4)}-${r.stck_bsop_date.slice(4, 6)}-${r.stck_bsop_date.slice(6, 8)}`,
      open: Number(r.stck_oprc),
      high: Number(r.stck_hgpr),
      low: Number(r.stck_lwpr),
      close: Number(r.stck_clpr),
      volume: Number(r.acml_vol),
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export interface ChartData {
  candles: Candle[];
  source: "kis" | "mock";
}

export async function getCandles(code: string): Promise<ChartData> {
  if (kisConfigured()) {
    try {
      const candles = await fetchKisCandles(code);
      if (candles.length > 0) return { candles, source: "kis" };
    } catch (err) {
      console.error("[kis] live fetch failed, using mock:", err);
    }
  }
  const stock = SNAPSHOT.find((s) => s.code === code);
  const base = stock?.price ?? 50000;
  return { candles: generateCandles(code, base), source: "mock" };
}
