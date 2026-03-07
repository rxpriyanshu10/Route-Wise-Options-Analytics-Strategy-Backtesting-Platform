"use client";

import { useChat } from "@ai-sdk/react";
import { Nav } from "@/components/nav";
import { DynamicChart } from "@/components/charts";
import { ArrowUp, Loader2, Check, Zap } from "lucide-react";
import { useRef, useEffect, useState } from "react";

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const suggestions = [
    "Show OI distribution for the nearest expiry",
    "What does the put-call ratio trend look like?",
    "Analyze Greeks for ATM strikes",
    "Find arbitrage opportunities across strikes",
  ];

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-(--bg) text-xs">
      <Nav />
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 w-full max-w-3xl mx-auto flex flex-col gap-4 hidden-scrollbar relative min-h-0"
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 m-auto">
            <div className="w-10 h-10 rounded-xl bg-(--card) border border-(--border) flex items-center justify-center mb-4">
              <Zap size={18} className="text-(--muted)" />
            </div>
            <h2 className="text-base font-semibold tracking-tight mb-1">Options Analytics</h2>
            <p className="text-(--muted) text-xs max-w-sm mb-6">
              Ask questions about NIFTY options data with strike-level analysis.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage({ text: prompt })}
                  className="text-left px-3 py-2.5 rounded-lg border border-(--border) bg-(--card) hover:border-(--ring) hover:bg-(--card-hover) transition-all text-(--muted) hover:text-(--fg) cursor-pointer text-xs"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-5 pb-4">
          {messages.map((message) => (
            <div key={message.id}>
              {message.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-(--border) text-(--fg) rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] text-[11px] leading-relaxed">
                    {message.parts
                      .filter((p): p is { type: "text"; text: string } => p.type === "text")
                      .map((p, i) => (
                        <span key={i}>{p.text}</span>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-w-[90%]">
                  {message.parts.map((part: any, i: number) => {
                    if (part.type === "text" && part.text) {
                      return (
                        <div
                          key={i}
                          className="text-(--fg) leading-relaxed whitespace-pre-wrap text-[11px] opacity-90"
                        >
                          {part.text}
                        </div>
                      );
                    }

                    // v6: tool parts come as "tool-{name}" or "dynamic-tool"
                    const isToolPart = part.type === "dynamic-tool" || part.type?.startsWith("tool-");
                    if (isToolPart) {
                      const toolName = part.toolName;
                      const state = part.state;
                      const args = part.input;

                      if (toolName === "createChart" && state === "result" && args?.data && args?.xKey && args?.yKeys) {
                        return (
                          <div
                            key={i}
                            className="bg-(--card) border border-(--border) rounded-lg flex flex-col p-3 max-w-2xl w-full"
                          >
                            {args.title && (
                              <h3 className="text-[10px] font-mono uppercase tracking-widest text-(--muted) mb-1.5 shrink-0 px-0.5">
                                {args.title}
                              </h3>
                            )}
                            <div className="w-full min-h-75">
                              <DynamicChart
                                data={args.data}
                                type={args.chartType}
                                xKey={args.xKey}
                                yKeys={args.yKeys}
                              />
                            </div>
                          </div>
                        );
                      }

                      if (state === "call" || state === "input-streaming") {
                        return (
                          <div
                            key={i}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-(--card) border border-(--border) text-[10px] font-mono text-(--muted)"
                          >
                            <Loader2 size={10} className="animate-spin" />
                            {toolName}
                          </div>
                        );
                      }

                      if (state === "result" && toolName !== "createChart") {
                        return (
                          <div
                            key={i}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-(--card) border border-(--border) text-[10px] font-mono text-(--muted) opacity-60"
                          >
                            <Check size={10} className="text-(--green)" />
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
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-(--muted) animate-pulse" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-(--muted) animate-pulse" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-(--muted) animate-pulse" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-(--border) p-3 max-w-3xl mx-auto w-full shrink-0 bg-(--bg)">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || isLoading) return;
            sendMessage({ text: input });
            setInput("");
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about options data..."
            className="flex-1 bg-(--card) border border-(--border) rounded-lg px-3.5 py-2 text-xs text-(--fg) placeholder:text-(--muted) outline-none focus:border-(--ring) transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-(--fg) text-(--bg) hover:opacity-90 transition-all disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Send message"
          >
            <ArrowUp size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
