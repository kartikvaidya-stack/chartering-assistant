"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const ROUTES = [
  "ECI",
  "China",
  "WCI/Paki",
  "AG/Red Sea",
  "Africa",
  "Long Haul",
  "SEA/Philippines",
  "Other",
] as const;

type Route = (typeof ROUTES)[number];

type MemoryItem =
  | {
      id: string;
      kind: "commentary";
      createdAt: string; // ISO
      route: Route;
      movement: string;
      drivers?: string;
      recommendation: string;
      rateTableText?: string; // optional simple text block
    }
  | {
      id: string;
      kind: "counter";
      createdAt: string; // ISO
      route: Route;
      cargo: string;
      size: string;
      loadBasis: string;
      mode: string;
      subject: string;
      body: string;
      extracted_terms?: Record<string, any>;
      behavior_label?: string;
      strategy_note?: string;
      diff_from_last?: string[];
      questions_for_user?: string[];
      raw_paste?: string;
    };

const STORAGE_KEY = "chartering_assistant_memory_v1";

function readMemory(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMemory(items: MemoryItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function CommentaryPage() {
  const [route, setRoute] = useState<Route>("ECI");

  const [movement, setMovement] = useState("");
  const [drivers, setDrivers] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const [useRateTable, setUseRateTable] = useState(false);
  const [rateTableText, setRateTableText] = useState("");

  const [status, setStatus] = useState<string | null>(null);

  const canSave = useMemo(() => {
    return movement.trim().length > 0 && recommendation.trim().length > 0;
  }, [movement, recommendation]);

  function saveCommentary() {
    if (!canSave) return;

    const item: MemoryItem = {
      id: newId(),
      kind: "commentary",
      createdAt: new Date().toISOString(),
      route,
      movement: movement.trim(),
      drivers: drivers.trim() ? drivers.trim() : undefined,
      recommendation: recommendation.trim(),
      rateTableText: useRateTable && rateTableText.trim() ? rateTableText.trim() : undefined,
    };

    const items = readMemory();
    items.unshift(item);
    writeMemory(items);

    setStatus("Saved to Freight Memory.");
  }

  async function copyFormatted() {
    const parts: string[] = [];
    parts.push(`Freight Commentary (${route})`);
    parts.push("");
    parts.push(`• ${movement.trim() || "—"}`);
    if (drivers.trim()) parts.push(`• ${drivers.trim()}`);
    parts.push("");
    parts.push(`Recommendation: ${recommendation.trim() || "—"}`);
    if (useRateTable && rateTableText.trim()) {
      parts.push("");
      parts.push("Rates:");
      parts.push(rateTableText.trim());
    }

    try {
      await navigator.clipboard.writeText(parts.join("\n"));
      setStatus("Copied formatted commentary to clipboard.");
    } catch {
      setStatus("Could not copy (browser permission).");
    }
  }

  function clear() {
    setMovement("");
    setDrivers("");
    setRecommendation("");
    setRateTableText("");
    setUseRateTable(false);
    setStatus("Cleared.");
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Chartering Assistant</div>
            <div className="text-sm text-slate-500">Daily Commentary</div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="hover:underline" href="/">Counter</Link>
            <Link className="hover:underline" href="/commentary">Daily Commentary</Link>
            <Link className="hover:underline" href="/memory">Freight Memory</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="border rounded-lg p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1 w-full">
              <label className="text-xs text-slate-500">Route (required)</label>
              <select
                className="border rounded-md px-3 py-2"
                value={route}
                onChange={(e) => setRoute(e.target.value as Route)}
              >
                {ROUTES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button className="border rounded-md px-4 py-2 hover:bg-slate-50" onClick={clear}>
              Clear
            </button>
          </div>

          <div className="mt-4">
            <label className="text-xs text-slate-500">Market Movement (required)</label>
            <textarea
              className="mt-1 w-full min-h-[120px] border rounded-md p-3 text-sm"
              placeholder="What changed vs last update (rates/tonnage/enquiry)?"
              value={movement}
              onChange={(e) => setMovement(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <label className="text-xs text-slate-500">Drivers / Reasons (optional)</label>
            <textarea
              className="mt-1 w-full min-h-[120px] border rounded-md p-3 text-sm"
              placeholder="Why? (positions tight, CPP competition, bunker, CIQ, CNY…)"
              value={drivers}
              onChange={(e) => setDrivers(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <label className="text-xs text-slate-500">Recommendation (required)</label>
            <textarea
              className="mt-1 w-full min-h-[120px] border rounded-md p-3 text-sm"
              placeholder="Actionable desk recommendation."
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              id="rateTableToggle"
              type="checkbox"
              checked={useRateTable}
              onChange={(e) => setUseRateTable(e.target.checked)}
            />
            <label htmlFor="rateTableToggle" className="text-sm">
              Add rate table (optional)
            </label>
          </div>

          {useRateTable ? (
            <div className="mt-3">
              <label className="text-xs text-slate-500">Rate table text (paste from Excel or type)</label>
              <textarea
                className="mt-1 w-full min-h-[120px] border rounded-md p-3 text-sm"
                placeholder="Example:
12kt ECI: 30 (2H Jan) / 27 (1H Feb) – Firm
12kt China: 27-28 – Stable"
                value={rateTableText}
                onChange={(e) => setRateTableText(e.target.value)}
              />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={`rounded-md px-4 py-2 text-sm ${
                canSave ? "bg-slate-900 text-white hover:opacity-90" : "bg-slate-200 text-slate-500 cursor-not-allowed"
              }`}
              onClick={saveCommentary}
              disabled={!canSave}
            >
              Save to Freight Memory
            </button>

            <button
              className="border rounded-md px-4 py-2 text-sm hover:bg-slate-50"
              onClick={copyFormatted}
              disabled={!movement.trim() && !drivers.trim() && !recommendation.trim()}
            >
              Copy formatted
            </button>

            <Link
              className="border rounded-md px-4 py-2 text-sm hover:bg-slate-50"
              href="/memory"
            >
              View Freight Memory
            </Link>
          </div>

          {status ? <div className="mt-3 text-xs text-slate-500">{status}</div> : null}
        </div>
      </main>
    </div>
  );
}
