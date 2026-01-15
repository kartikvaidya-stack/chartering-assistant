"use client";

import { useEffect, useMemo, useState } from "react";
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
type CounterStatus = "In Progress" | "Completed (Fixed)" | "Dropped";

type MemoryItem =
  | {
      id: string;
      kind: "commentary";
      createdAt: string;
      route: Route;
      movement: string;
      drivers?: string;
      recommendation: string;
      rateTableText?: string;
    }
  | {
      id: string;
      kind: "counter";
      createdAt: string;
      lastUpdatedAt?: string;
      route: Route;
      cargo: string;
      size: string;
      loadBasis: string;
      mode: string;
      status: CounterStatus;
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

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function MemoryPage() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [route, setRoute] = useState<Route | "All">("All");
  const [kind, setKind] = useState<"All" | "commentary" | "counter">("All");
  const [status, setStatus] = useState<"All" | CounterStatus>("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    setItems(readMemory());
  }, []);

  const counters = useMemo(
    () => items.filter((x) => x.kind === "counter") as Extract<MemoryItem, { kind: "counter" }>[],
    [items]
  );

  const counterStats = useMemo(() => {
    const total = counters.length;
    const inProgress = counters.filter((c) => c.status === "In Progress").length;
    const completed = counters.filter((c) => c.status === "Completed (Fixed)").length;
    const dropped = counters.filter((c) => c.status === "Dropped").length;
    return { total, inProgress, completed, dropped };
  }, [counters]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return items.filter((it) => {
      if (route !== "All" && it.route !== route) return false;
      if (kind !== "All" && it.kind !== kind) return false;

      if (it.kind === "counter" && status !== "All" && it.status !== status) return false;

      if (!query) return true;

      const hay = (() => {
        if (it.kind === "commentary") {
          return [it.route, it.movement, it.drivers || "", it.recommendation, it.rateTableText || ""]
            .join(" ")
            .toLowerCase();
        } else {
          return [
            it.route,
            it.cargo,
            it.size,
            it.loadBasis,
            it.mode,
            it.status,
            it.subject,
            it.body,
            JSON.stringify(it.extracted_terms || {}),
            (it.diff_from_last || []).join(" "),
            it.behavior_label || "",
            it.strategy_note || "",
            (it.questions_for_user || []).join(" "),
            it.raw_paste || "",
          ]
            .join(" ")
            .toLowerCase();
        }
      })();

      return hay.includes(query);
    });
  }, [items, route, kind, status, q]);

  function refresh() {
    setItems(readMemory());
  }

  function clearAll() {
    if (!confirm("Clear all Freight Memory items from this browser?")) return;
    writeMemory([]);
    setItems([]);
  }

  function updateCounterStatus(id: string, next: CounterStatus) {
    const updated = items.map((it) => {
      if (it.kind !== "counter") return it;
      if (it.id !== id) return it;
      return { ...it, status: next, lastUpdatedAt: new Date().toISOString() };
    });
    writeMemory(updated);
    setItems(updated);
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Chartering Assistant</div>
            <div className="text-sm text-slate-500">Freight Memory</div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="hover:underline" href="/">Counter</Link>
            <Link className="hover:underline" href="/commentary">Daily Commentary</Link>
            <Link className="hover:underline" href="/memory">Freight Memory</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Dashboard */}
        <div className="border rounded-lg p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">Counters dashboard</div>
              <div className="text-xs text-slate-500">
                Total: <span className="font-semibold text-slate-900">{counterStats.total}</span>{" "}
                · In progress: <span className="font-semibold text-slate-900">{counterStats.inProgress}</span>{" "}
                · Completed: <span className="font-semibold text-slate-900">{counterStats.completed}</span>{" "}
                · Dropped: <span className="font-semibold text-slate-900">{counterStats.dropped}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="border rounded-md px-4 py-2 hover:bg-slate-50" onClick={refresh}>
                Refresh
              </button>
              <button className="border rounded-md px-4 py-2 hover:bg-slate-50" onClick={clearAll}>
                Clear all
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Route</label>
                <select className="border rounded-md px-3 py-2" value={route} onChange={(e) => setRoute(e.target.value as any)}>
                  <option value="All">All</option>
                  {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Type</label>
                <select className="border rounded-md px-3 py-2" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                  <option value="All">All</option>
                  <option value="commentary">Commentary</option>
                  <option value="counter">Counter</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Counter status</label>
                <select className="border rounded-md px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  <option value="All">All</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed (Fixed)">Completed (Fixed)</option>
                  <option value="Dropped">Dropped</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[260px]">
                <label className="text-xs text-slate-500">Search</label>
                <input
                  className="border rounded-md px-3 py-2 text-sm"
                  placeholder="Search broker/owner/ports/rate/keywords…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>

            <div className="text-sm text-slate-600">
              Showing <span className="font-semibold text-slate-900">{filtered.length}</span> items
            </div>
          </div>

          {/* List */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            {filtered.map((it) => (
              <div key={it.id} className="border rounded-lg p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="font-medium">
                    [{it.route}] {it.kind === "commentary" ? "Commentary" : `Counter · ${(it as any).status || "In Progress"}`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatDate(it.kind === "counter" && (it as any).lastUpdatedAt ? (it as any).lastUpdatedAt : it.createdAt)}
                  </div>
                </div>

                {it.kind === "commentary" ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <div><span className="text-xs text-slate-500">Movement: </span>{it.movement}</div>
                    {it.drivers ? <div><span className="text-xs text-slate-500">Drivers: </span>{it.drivers}</div> : null}
                    <div><span className="text-xs text-slate-500">Recommendation: </span>{it.recommendation}</div>
                    {it.rateTableText ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-medium">Rates</summary>
                        <pre className="mt-2 text-xs whitespace-pre-wrap">{it.rateTableText}</pre>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="text-xs text-slate-500">
                      {(it as any).cargo} · {(it as any).size} · {(it as any).loadBasis} · {(it as any).mode}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="border rounded-md px-3 py-1 text-xs hover:bg-slate-50" onClick={() => updateCounterStatus(it.id, "In Progress")}>
                        Mark In Progress
                      </button>
                      <button className="border rounded-md px-3 py-1 text-xs hover:bg-slate-50" onClick={() => updateCounterStatus(it.id, "Completed (Fixed)")}>
                        Mark Completed
                      </button>
                      <button className="border rounded-md px-3 py-1 text-xs hover:bg-slate-50" onClick={() => updateCounterStatus(it.id, "Dropped")}>
                        Mark Dropped
                      </button>
                    </div>

                    <details>
                      <summary className="cursor-pointer text-sm font-medium">Email draft</summary>
                      <div className="mt-2">
                        <div className="text-xs text-slate-500">Subject</div>
                        <div className="text-sm">{(it as any).subject}</div>
                      </div>
                      <div className="mt-2">
                        <div className="text-xs text-slate-500">Body</div>
                        <pre className="mt-1 text-xs whitespace-pre-wrap border rounded-md p-3 bg-slate-50">
                          {(it as any).body}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 ? (
              <div className="text-sm text-slate-600 border rounded-lg p-4">
                No items match your filters. Save a Daily Commentary or a Counter.
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
