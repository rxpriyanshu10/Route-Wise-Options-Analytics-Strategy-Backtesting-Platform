import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const SYSTEM = `You are an options strategy advisor. Given a user's market view, respond with ONLY valid JSON (no markdown, no backticks) in this exact format:
{
  "sentiment": "bullish" | "bearish" | "neutral",
  "strategy_ids": ["strategy_id_1", "strategy_id_2"],
  "explanation": "1-2 sentence explanation of why these strategies fit the user's view"
}

Available strategy IDs and when to recommend them:

BULLISH:
- "long_call": simple directional bullish, unlimited upside
- "bull_call_spread": bullish, limited risk/reward debit spread
- "bull_put_spread": bullish credit spread, profits if price stays above
- "covered_call": bullish but caps upside, reduces cost
- "protective_put": bullish with downside insurance
- "ratio_call_spread": moderately bullish, reduces cost via selling 2 OTM calls
- "jade_lizard": bullish, collects premium, no upside risk if credit is enough
- "call_ladder": moderately bullish, risk on big rally

BEARISH:
- "long_put": simple directional bearish
- "bear_put_spread": bearish, limited risk debit spread
- "bear_call_spread": bearish credit spread, profits if price stays below
- "ratio_put_spread": moderately bearish, risk on big crash
- "put_ladder": moderately bearish, risk on big crash

NEUTRAL / VOLATILITY:
- "long_straddle": expecting big move either direction
- "short_straddle": expecting low volatility, theta decay
- "long_strangle": expecting big move, cheaper than straddle
- "short_strangle": range-bound, premium collection
- "iron_condor": range-bound, defined risk premium collection
- "wide_iron_condor": range-bound with more room, lower credit
- "iron_butterfly": range-bound, higher credit, tighter range
- "long_butterfly": expecting price to stay near ATM (call-based)
- "put_butterfly": expecting price to stay near ATM (put-based)

Pick 1-3 strategies that best match the user's view. Be specific in your explanation referencing the user's words.`;

async function fetchBackend(path: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

export async function POST(req: Request) {
  const { prompt, expiry }: { prompt: string; expiry: string } = await req.json();

  if (!prompt || !expiry) {
    return Response.json({ error: "prompt and expiry are required" }, { status: 400 });
  }

  // Step 1: Use LLM to extract sentiment and strategy IDs
  let aiResult: { sentiment: string; strategy_ids: string[]; explanation: string };
  try {
    const { text } = await (generateText as any)({
      model: openrouter.chat("google/gemini-2.5-flash-lite"),
      system: SYSTEM,
      prompt,
      maxTokens: 200,
    });
    aiResult = JSON.parse(text.trim());
  } catch {
    // Fallback to simple keyword matching if LLM fails
    const lower = prompt.toLowerCase();
    const bullish = ["bullish", "bull", "call", "long", "rally", "up", "rise", "breakout"].some(k => lower.includes(k));
    const bearish = ["bearish", "bear", "put", "short", "drop", "down", "fall", "crash"].some(k => lower.includes(k));

    const sentiment = bullish ? "bullish" : bearish ? "bearish" : "neutral";
    const ids: Record<string, string[]> = {
      bullish: ["bull_call_spread", "bull_put_spread", "long_call"],
      bearish: ["bear_put_spread", "bear_call_spread", "long_put"],
      neutral: ["long_straddle", "iron_condor", "short_strangle"],
    };
    aiResult = {
      sentiment,
      strategy_ids: ids[sentiment],
      explanation: `Based on your ${sentiment} outlook, here are suitable strategies.`,
    };
  }

  // Step 2: Fetch strategies from backend
  let strategiesData: any;
  try {
    strategiesData = await fetchBackend("/api/strategies", { expiry });
  } catch {
    return Response.json({ error: "Failed to fetch strategies from backend" }, { status: 502 });
  }

  const allStrategies = strategiesData?.strategies || [];
  const recommended = allStrategies.filter((s: any) => aiResult.strategy_ids.includes(s.id));

  // Step 3: Optimize each recommended strategy (in parallel)
  const optimized = await Promise.all(
    recommended.map(async (strat: any) => {
      try {
        const opt = await fetchBackend("/api/strategy/optimize", {
          expiry,
          strategy_id: strat.id,
        });
        return {
          strategy: strat,
          optimization: opt.error ? null : opt,
        };
      } catch {
        return { strategy: strat, optimization: null };
      }
    })
  );

  // Step 4: Build final explanation with optimization data
  let explanation = aiResult.explanation;
  if (optimized.length > 0 && optimized[0].optimization) {
    const opt = optimized[0].optimization;
    const best = opt.best || {};
    const bestTs = opt.best_timespan || {};
    const bestHr = opt.best_entry_hour || {};
    explanation += ` Best historical entry: ${best.entry ?? "N/A"} (P&L: ${best.pnl ?? "N/A"}). Optimal hold: ${bestTs.hold_fraction != null ? (bestTs.hold_fraction * 100).toFixed(0) + "%" : "N/A"} of remaining time (win rate: ${bestTs.win_rate ?? "N/A"}%). Best entry hour: ${bestHr.hour ?? "N/A"}:00 (avg P&L: ${bestHr.avg_pnl ?? "N/A"}).`;
  }

  return Response.json({
    prompt,
    detected_sentiment: aiResult.sentiment,
    explanation,
    recommended: optimized,
    spot: strategiesData?.spot,
    atm: strategiesData?.atm,
  });
}
