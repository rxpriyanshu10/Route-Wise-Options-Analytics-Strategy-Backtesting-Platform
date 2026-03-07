import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, UIMessage, convertToModelMessages, tool, stepCountIs } from "ai";
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
- Direction Prediction (Random Forest): predicts spot price direction from options flow features. Also uses relative features.

When a user asks for analysis or visualization:
1. Use the appropriate tool to fetch data
2. Return a chart specification using the createChart tool
3. Provide brief analytical insights

When asked about anomalies, unusual activity, or market signals:
1. Use getAnomalies to detect anomalous market snapshots
2. Explain what makes them anomalous and trading implications

When asked about direction prediction or market outlook:
1. Use getDirection to get ML predictions
2. Summarize the signal distribution and key feature drivers

Keep responses concise and focused on the data. Always specify chart details clearly.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openrouter.chat("arcee-ai/trinity-large-preview:free"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      getOverview: tool({
        description: "Get dataset overview including available expiries, date range, and row count",
        inputSchema: z.object({}),
        execute: async () => {
          return await fetchBackend("/api/overview");
        },
      }),
      getOIByStrike: tool({
        description: "Get open interest data grouped by strike price for a given expiry",
        inputSchema: z.object({
          expiry: z.string().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/oi-by-strike", { expiry });
        },
      }),
      getVolumeByStrike: tool({
        description: "Get trading volume data grouped by strike price for a given expiry",
        inputSchema: z.object({
          expiry: z.string().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/volume-by-strike", { expiry });
        },
      }),
      getPCR: tool({
        description: "Get Put-Call Ratio timeseries data for a given expiry",
        inputSchema: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/pcr-timeseries", expiry ? { expiry } : {});
        },
      }),
      getSpotTimeseries: tool({
        description: "Get spot price and ATM timeseries for a given expiry",
        inputSchema: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/spot-timeseries", expiry ? { expiry } : {});
        },
      }),
      getStraddlePrice: tool({
        description: "Get ATM straddle price over time for a given expiry",
        inputSchema: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/straddle-price", expiry ? { expiry } : {});
        },
      }),
      getOIChange: tool({
        description: "Get OI change over time for a given expiry",
        inputSchema: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/oi-change", expiry ? { expiry } : {});
        },
      }),
      getCandlePatterns: tool({
        description:
          "Detect candlestick patterns (Marubozu, Doji, Hammer, Engulfing, Morning Star, etc.) from spot price OHLC data and get their impact on option premiums. Returns detected patterns with signal direction, confidence, and CE/PE impact.",
        inputSchema: z.object({
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
        inputSchema: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/anomalies", expiry ? { expiry } : {});
        },
      }),
      getDirection: tool({
        description:
          "Predict spot price direction using Random Forest ML model trained on options flow features (PCR, OI skew, volume ratios, straddle %). Returns bullish/bearish/neutral signals with confidence. Works on any expiry.",
        inputSchema: z.object({
          expiry: z.string().optional().describe("Expiry date in YYYY-MM-DD format"),
        }),
        execute: async ({ expiry }) => {
          return await fetchBackend("/api/direction", expiry ? { expiry } : {});
        },
      }),
      queryData: tool({
        description: "Flexible query for custom analysis. Can filter, group, and aggregate options data.",
        inputSchema: z.object({
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
        inputSchema: z.object({
          chartType: z.enum(["bar", "line", "area"]).describe("Type of chart"),
          title: z.string().describe("Chart title"),
          xKey: z.string().describe("Key for x-axis from the data"),
          yKeys: z.array(z.string()).describe("Keys for y-axis values"),
          data: z.array(z.record(z.string(), z.unknown())).describe("Array of data objects for the chart"),
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
