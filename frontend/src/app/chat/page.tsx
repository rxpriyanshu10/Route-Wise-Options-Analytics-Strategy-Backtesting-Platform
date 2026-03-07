"use client";

import { useChat } from "@ai-sdk/react";
import { Nav } from "@/components/nav";
import { DynamicChart } from "@/components/charts";
import { Send } from "lucide-react";
import { useRef, useEffect, useState } from "react";

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--bg)] text-xs">
      <Nav />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 w-full max-w-4xl mx-auto flex flex-col gap-4 hidden-scrollbar relative min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 m-auto">
            <h2 className="text-base font-semibold tracking-tight mb-2">Options Analytics Chat</h2>
            <p className="text-[var(--muted)] text-xs max-w-sm mb-6">
              Ask questions about NIFTY options data. Select a prompt below to get started:
            </p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {[
                "Show me the OI distribution for the Feb 17 expiry",
                "What does the put-call ratio look like over time?",
                "Compare straddle prices across expiries",
                "Show me where the highest volume strikes are",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    sendMessage({ text: prompt });
                  }}
                  className="text-left px-3 py-2 rounded border border-[var(--border)] bg-transparent hover:border-[var(--muted)] hover:text-[var(--fg)] transition-all text-[var(--muted)] truncate"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-4 pb-4">
          {messages.map((message) => (
            <div key={message.id}>
              {message.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-[var(--card)] border border-[var(--border)] text-[var(--fg)] rounded px-3 py-2 max-w-[80%] font-mono text-[11px]">
                    {message.parts
                      .filter((p): p is { type: "text"; text: string } => p.type === "text")
                      .map((p, i) => (
                        <span key={i}>{p.text}</span>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {message.parts.map((part, i) => {
                    if (part.type === "text" && part.text) {
                      return (
                        <div
                          key={i}
                          className="text-[var(--fg)] px-1 py-1 max-w-[90%] leading-relaxed whitespace-pre-wrap font-sans opacity-90"
                        >
                          {part.text}
                        </div>
                      );
                    }

                    if (part.type === "tool-invocation") {
                      const { toolInvocation } = part as any;
                      const { toolName, args, state } = toolInvocation;

                      // createChart — render the chart
                      if (toolName === "createChart" && args?.data && args?.xKey && args?.yKeys) {
                        return (
                          <div
                            key={i}
                            className="bg-[var(--card)] border border-[var(--border)] rounded flex flex-col p-2 max-w-2xl w-full"
                          >
                            {args.title && <h3 className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1 shrink-0 px-0.5">{args.title}</h3>}
                            <DynamicChart
                              data={args.data}
                              type={args.chartType}
                              xKey={args.xKey}
                              yKeys={args.yKeys}
                            />
                          </div>
                        );
                      }

                      // Tool in progress
                      if (state === "call" || state === "partial-call") {
                        return (
                          <div key={i} className="text-[10px] uppercase font-mono tracking-widest text-[var(--muted)] flex items-center gap-1.5 px-1 py-0.5">
                            <span className="inline-block w-1 h-1 rounded-full bg-[var(--fg)] animate-pulse" />
                            {toolName}...
                          </div>
                        );
                      }

                      // Tool completed — show a subtle confirmation
                      if (state === "result" && toolName !== "createChart") {
                        return (
                          <div key={i} className="text-[10px] uppercase font-mono tracking-widest text-[var(--muted)] flex items-center gap-1.5 px-1 py-0.5 opacity-50">
                            <span className="text-[var(--fg)]">✓</span>
                            {toolName}
                          </div>
                        );
                      }

                      return null;
                    }

                    return null;
                  })}
                </div>
              )}
            </div>
          ))}

          {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant") && (
            <div className="text-[10px] uppercase font-mono tracking-widest text-[var(--muted)] flex items-center gap-1.5 px-1 py-0.5">
              <span className="inline-block w-1.5 h-1.5 bg-[var(--fg)] animate-pulse" />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--border)] p-2 max-w-4xl mx-auto w-full shrink-0 bg-[var(--bg)]">
        <form onSubmit={handleSubmit} className="flex gap-2 relative">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about options data..."
            className="flex-1 bg-transparent border border-[var(--border)] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--muted)] transition-colors text-[var(--fg)] placeholder:text-[var(--muted)]"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center justify-center border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] rounded px-3 py-1.5 hover:border-[var(--muted)] hover:bg-[var(--border)] transition-all disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:bg-[var(--card)]"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
