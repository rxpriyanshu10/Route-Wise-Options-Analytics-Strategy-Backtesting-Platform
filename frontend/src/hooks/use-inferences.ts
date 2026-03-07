import { useState, useCallback } from "react";

type PanelInput = { id: string; title: string; summary: string };

export function useInferences() {
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const fetchInferences = useCallback(async (panels: PanelInput[]) => {
    if (panels.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panels }),
      });
      const data = await res.json();
      setInsights(data);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  return { insights, loading, fetchInferences };
}
