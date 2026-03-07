import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const SYSTEM = `You are a concise options market analyst. Given a data summary for a specific panel on a trading dashboard, provide a 1-2 sentence actionable inference. Be specific about numbers. No markdown, no bullet points — just a brief plain-text insight a trader can glance at. Focus on what the data implies for trading decisions.`;

export async function POST(req: Request) {
  const { panels }: { panels: { id: string; title: string; summary: string }[] } = await req.json();

  const results: Record<string, string> = {};

  // Process all panels in parallel
  const tasks = panels.map(async (panel) => {
    try {
      const { text } = await (generateText as any)({
        model: openrouter.chat("google/gemini-2.5-flash-lite"),
        system: SYSTEM,
        prompt: `Dashboard panel: "${panel.title}"\n\nData:\n${panel.summary}`,
        maxTokens: 120,
      });
      results[panel.id] = text.trim();
    } catch {
      results[panel.id] = "";
    }
  });

  await Promise.all(tasks);
  return Response.json(results);
}
