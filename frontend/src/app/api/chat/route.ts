import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, tool, Message } from "ai";
import { z } from "zod";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchBackend(path: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString());
  return res.json();
}

const SYSTEM_PROMPT = `You are an options market analytics assistant for NIFTY index options data.
You help users analyze options data by fetching data and creating chart specifications.

Available data: NIFTY options with columns: symbol, datetime, expiry, CE, PE, spot_close, ATM, strike, oi_CE, oi_PE, volume_CE, volume_PE.
Expiries available in the dataset can be fetched via the overview tool.

You can also detect candlestick patterns (Marubozu, Doji, Spinning Top, Hammer, Hanging Man, Shooting Star, Engulfing, Harami, Piercing, Dark Cloud Cover, Morning Star, Evening Star) from spot price data and analyze their impact on option premiums.

You have ML models available:
- Anomaly Detection (Isolation Forest): detects unusual market activity from options flow. Uses relative features so it works on any expiry without retraining.

You can compute option Greeks and Black-Scholes pricing:
- Greeks (Delta, Gamma, Theta, Vega, Rho) and Implied Volatility for any strike/expiry/datetime
- IV Surface data for visualizing the volatility smile/skew across strikes and time
- Put-Call Parity checks with arbitrage opportunity detection (conversion/reversal strategies)
- Full option chain with per-strike CE/PE prices, OI, volume, IV, and Greeks

IMPORTANT: Always include relevant strike prices in your analysis and responses. When discussing OI, volume, Greeks, IV, or arbitrage data, mention the specific strike prices involved (e.g. "highest CE OI at strike 25500", "IV skew steepens below strike 25200"). Strike prices are critical context for traders.

When a user asks for analysis or visualization:
1. Use the appropriate tool to fetch data
2. Return a chart specification using the createChart tool
3. Provide brief analytical insights with specific strike prices

When asked about anomalies, unusual activity, or market signals:
1. Use getAnomalies to detect anomalous market snapshots
2. Explain what makes them anomalous and trading implications

Keep responses concise and focused on the data. Always specify chart details clearly.`;

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  const result = await streamText({
    model: openrouter.chat("google/gemini-2.5-pro") as any,
    system: SYSTEM_PROMPT,
    messages: messages as any,
    maxSteps: 5,
    tools: {
      getOverview: tool({
        description: "Get dataset overview including available expiries, date range, and row count",
        parameters: z.object({}),
        execute: async () => {
          return await fetchBackend("/api/overview");
        },
      }),
      getOIByStrike: tool({
        description: "Get open interest data grouped by strike price for a given expiry. Returns strikes array with CE and PE OI values per strike.",
        parameters: z.object({
          expiry: z.string().describe("Expiry date in YYYY-MM-DD format"),
          strike_min: z.number().optional().describe("Minimum strike price to filter"),
          strike_max: z.number().optional().describe("Maximum strike price to filter"),
        }),
        execute: async ({ expiry, strike_min, strike_max }) => {
          const params: Record<string, string> = { expiry };
          if (strike_min) params.strike_min = String(strike_min);
          if (strike_max) params.strike_max = String(strike_max);
          return await fetchBackend("/api/oi-by-strike", params);
        },
      }),
      getVolumeByStrike: tool({
        description: "Get trading volume data grouped by strike price for a given expiry. Returns strikes array with CE and PE volume per strike.",
        parameters: z.object({
          expiry: z.string().describe("Expiry date in YYYY-MM-DD format"),
          strike_min: z.number().optional().describe("Minimum strike price to filter"),
          strike_max: z.number().optional().describe("Maximum strike price to filter"),
        }),
        execute: async ({ expiry, strike_min, strike_max }) => {
          const params: Record<string, string> = { expiry };
          if (strike_min) params.strike_min = String(strike_min);
          if (strike_max) params.strike_max = String(strike_max);
          return await fetchBackend("/api/volume-by-strike", params);
        },
      }),
      getPCR: tool({
        description: "Get Put-Call Ratio timeseries data for a given expiry",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/pcr-timeseries", expiry ? { expiry } : {});
        },
      }),
      getSpotTimeseries: tool({
        description: "Get spot price and ATM timeseries for a given expiry",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/spot-timeseries", expiry ? { expiry } : {});
        },
      }),
      getStraddlePrice: tool({
        description: "Get ATM straddle price over time for a given expiry",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/straddle-price", expiry ? { expiry } : {});
        },
      }),
      getOIChange: tool({
        description: "Get OI change over time for a given expiry",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/oi-change", expiry ? { expiry } : {});
        },
      }),
      getCandlePatterns: tool({
        description:
          "Detect candlestick patterns (Marubozu, Doji, Hammer, Engulfing, Morning Star, etc.) from spot price OHLC data and get their impact on option premiums. Returns detected patterns with signal direction, confidence, and CE/PE impact.",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
          interval: z.string().optional().describe("Candle interval: 15T (15min), 30T (30min), 1H (hourly), 1D (daily). Defaults to 1D."),
        }),
        execute: async ({ expiry, interval }) => {
          const params: Record<string, string> = {};
          if (expiry) params.expiry = expiry;
          if (interval) params.interval = interval;
          return await fetchBackend("/api/candle-patterns", params);
        },
      }),
      getAnomalies: tool({
        description:
          "Detect anomalous market activity using Isolation Forest ML model. Returns timestamps with unusual OI/volume/PCR patterns. Works on any expiry without retraining.",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/anomalies", expiry ? { expiry } : {});
        },
      }),
      getGreeks: tool({
        description:
          "Get option Greeks (Delta, Gamma, Theta, Vega, Rho) and implied volatility for options at a given expiry and datetime. Also returns Black-Scholes theoretical prices. Useful for analyzing option sensitivities and IV skew.",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
          datetime: z.string().optional().describe("Specific datetime snapshot in YYYY-MM-DD HH:MM:SS format"),
          strike: z.number().optional().describe("Specific strike price to filter"),
        }),
        execute: async ({ expiry, datetime, strike }) => {
          const params: Record<string, string> = {};
          if (expiry) params.expiry = expiry;
          if (datetime) params.datetime = datetime;
          if (strike) params.strike = String(strike);
          return await fetchBackend("/api/greeks", params);
        },
      }),
      getIVSurface: tool({
        description:
          "Get implied volatility surface data across strikes and time for 3D visualization. Shows IV smile/skew patterns across different strikes and time to expiry.",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/iv-surface", expiry ? { expiry } : {});
        },
      }),
      getOptionChain: tool({
        description:
          "Get the full option chain for a given expiry and datetime. Shows per-strike CE/PE prices, OI, volume, IV, and Greeks (delta, gamma, theta, vega). Useful for analyzing support/resistance from OI, IV skew, and options positioning.",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
          datetime: z.string().optional().describe("Specific datetime snapshot in YYYY-MM-DD HH:MM:SS format"),
        }),
        execute: async ({ expiry, datetime }) => {
          const params: Record<string, string> = {};
          if (expiry) params.expiry = expiry;
          if (datetime) params.datetime = datetime;
          return await fetchBackend("/api/option-chain", params);
        },
      }),
      getParityArbitrage: tool({
        description:
          "Check put-call parity and detect arbitrage opportunities. Shows mispricing between CE and PE prices vs theoretical (C - P = S - K*e^(-rT)). Returns conversion/reversal strategies when mispricing exceeds threshold.",
        parameters: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
          datetime: z.string().optional().describe("Specific datetime snapshot"),
          threshold: z.number().optional().describe("Minimum mispricing in points to flag (default 5)"),
        }),
        execute: async ({ expiry, datetime, threshold }) => {
          const params: Record<string, string> = {};
          if (expiry) params.expiry = expiry;
          if (datetime) params.datetime = datetime;
          if (threshold) params.threshold = String(threshold);
          return await fetchBackend("/api/parity-arbitrage", params);
        },
      }),
      queryData: tool({
        description: "Flexible query for custom analysis. Can filter, group, and aggregate options data.",
        parameters: z.object({
          expiry: z.string().optional(),
          strike_min: z.number().optional(),
          strike_max: z.number().optional(),
          datetime_start: z.string().optional(),
          datetime_end: z.string().optional(),
          group_by: z.string().optional().describe("Comma-separated columns to group by"),
          agg: z.enum(["sum", "mean"]).optional(),
          columns: z.string().optional().describe("Comma-separated column names to return"),
          limit: z.number().optional(),
        }),
        execute: async (params) => {
          const queryParams: Record<string, string> = {};
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined) queryParams[k] = String(v);
          });
          return await fetchBackend("/api/query", queryParams);
        },
      }),
      createChart: tool({
        description:
          "Create a chart visualization. Use this after fetching data to display it as a chart to the user.",
        parameters: z.object({
          chartType: z.enum(["bar", "line", "area"]).describe("Type of chart"),
          title: z.string().describe("Chart title"),
          xKey: z.string().describe("Key for x-axis from the data"),
          yKeys: z.array(z.string()).describe("Keys for y-axis values"),
          data: z.array(z.record(z.string(), z.unknown())).describe("Array of data objects for the chart"),
        }),
        execute: async (params) => {
          return { success: true, message: "Chart created successfully" };
        }
      }),
    },
  });

  return result.toDataStreamResponse();
}
