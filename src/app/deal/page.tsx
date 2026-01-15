"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CounterStatus = "In Progress" | "Completed (Fixed)" | "Dropped";
type Route = "ECI" | "China" | "WCI/Paki" | "AG/Red Sea" | "Africa" | "Long Haul" | "SEA/Philippines" | "Other";

type CounterMemoryItem = {
  id: string;
  kind: "counter";
  createdAt: string;
  lastUpdatedAt?: string;

  dealId?: string;

  route: Route;
  cargoFamily: string;
  cargoType: string;

  size: string;
  loadBasis: string;

  mode: string;
  status: CounterStatus;

  subject: string;
  body: string;

  extracted_terms?: Record<string, any>;
  raw_paste?: string;
};

type MemoryItem = any;

const STORAGE_KEY = "chartering_assistant_memory_v1";
const ACTIVE_COUNTER_KEY = "chartering_assistant_active_counter_id_v1";
const ACTIVE_DEAL_KEY = "chartering_assistant_active_deal_id_v1";

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

function shortOneLine(s: string, max = 80) {
  const one = (s || "").replace(/\s+/g, " ").trim();
  if (!one) return "—";
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

function parseTime(iso?: string) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function formatDate(iso?: string) {
  const t = parseTime(iso);
  if (!t) return "—";
  return new Date(t).toLocaleString();
}

function getDealId(c: CounterMemoryItem) {
  return c.dealId || c.extracted_terms?.dealId || "unthreaded";
}

function isCargoOrder(c: CounterMemoryItem) {
  return Boolean(c.extracted_terms?.isCargoOrder);
}

export default function DealBoardPage() {
  const router = useRouter();

  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<string>("");

  useEffect(() => {
    setMemory(readMemory());
    const saved = localStorage.getItem(ACTIVE_DEAL_KEY);
    if (saved) setSelectedDeal(saved);
  }, []);

  const counters = useMemo(() => {
    return memory.filter((x) => x.kind === "counter") as CounterMemoryItem[];
  }, [memory]);

  const deals = useMemo(() => {
    const map = new Map<string, CounterMemoryItem[]>();
    for (const c of counters) {
      const id = getDealId(c);
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(c);
    }
    const list = Array.from(map.entries()).map(([dealId, items]) => {
      const sorted = [...items].sort((a, b) => (b.lastUpdatedAt || b.createdAt).localeCompare(a.lastUpdatedAt || a.createdAt));
      const cargoOrder = sorted.find(isCargoOrder);
      const latest = sorted[0];
      const open = sorted.filter((x) => (x.status || "In Progress") === "In Progress").length;
      return { dealId, items: sorted, cargoOrder, latest, open };
    });
    list.sort((a, b) => (b.latest.lastUpdatedAt || b.latest.createdAt).localeCompare(a.latest.lastUpdatedAt || a.latest.createdAt));
    return list;
  }, [counters]);

  const active = useMemo(() => {
    if (!selectedDeal) return null;
    return deals.find((d) => d.dealId === selectedDeal) || null;
  }, [deals, selectedDeal]);

  function refresh() {
    setMemory(readMemory());
  }

  function openInCounter(c: CounterMemoryItem) {
    const dealId = getDealId(c);
    localStorage.setItem(ACTIVE_DEAL_KEY, dealId);
    localStorage.setItem(ACTIVE_COUNTER_KEY, c.id);
    setSelectedDeal(dealId);
    router.push("/");
  }

  function markFixed(id: string) {
    const now = new Date().toISOString();
    const all = readMemory();
    const updated = all.map((it) => {
      if (it.kind !== "counter") return it;
      const c = it as CounterMemoryItem;
      if (c.id !== id) return it;
      return { ...c, status: "Completed (Fixed)" as CounterStatus, lastUpdatedAt: now };
    });
    writeMemory(updated);
    setMemory(updated);
  }

  async function copyText(txt: string) {
    try {
      await navigator.clipboard.writeText(txt || "");
    } catch {}
  }

  // UI
  const pageBg = "bg-slate-50";
  const cardBg = "bg-white";
  const border = "border border-slate-200";
  const buttonSoft = "border border-slate-200 bg-white hover:bg-slate-50";
  const buttonPrimary = "bg-slate-700 text-white hover:opacity-90";

  return (
    <div className={`min-h-screen ${pageBg} text-slate-900`}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Chartering Assistant</div>
            <div className="text-sm text-slate-500">Deal Board</div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="hover:underline" href="/">Counter</Link>
            <Link className="hover:underline" href="/cargo-order">Cargo Order</Link>
            <Link className="hover:underline" href="/deal">Deals</Link>
            <Link className="hover:underline" href="/commentary">Daily Commentary</Link>
            <Link className="hover:underline" href="/memory">Freight Memory</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className={`${border} ${cardBg} rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Deals</div>
              <div className="text-xs text-slate-500">Select a deal to view its cargo order + counter timeline.</div>
            </div>
            <div className="flex gap-2">
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={refresh}>
                Refresh
              </button>
              <Link className={`${buttonSoft} rounded-md px-4 py-2`} href="/cargo-order">
                New Cargo Order
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Deal list */}
            <div className={`${border} rounded-md p-3 bg-white md:col-span-1`}>
              <div className="text-sm font-medium">Deal list</div>
              <div className="mt-2 text-xs text-slate-500">Total: {deals.length}</div>

              <div className="mt-3 flex flex-col gap-2">
                {deals.map((d) => (
                  <button
                    key={d.dealId}
                    className={`${border} rounded-md p-3 text-left ${selectedDeal === d.dealId ? "bg-slate-50" : "bg-white"} hover:bg-slate-50`}
                    onClick={() => {
                      setSelectedDeal(d.dealId);
                      localStorage.setItem(ACTIVE_DEAL_KEY, d.dealId);
                    }}
                  >
                    <div className="text-xs text-slate-500">
                      {d.open} open · last: {formatDate(d.latest.lastUpdatedAt || d.latest.createdAt)}
                    </div>
                    <div className="text-sm font-medium">{d.dealId}</div>
                    <div className="text-xs text-slate-500">{shortOneLine(d.latest.subject, 90)}</div>
                  </button>
                ))}

                {deals.length === 0 ? (
                  <div className="text-sm text-slate-600">No deals yet. Save a cargo order first.</div>
                ) : null}
              </div>
            </div>

            {/* Deal detail */}
            <div className={`${border} rounded-md p-3 bg-white md:col-span-2`}>
              {!active ? (
                <div className="text-sm text-slate-600">Select a deal from the list.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{active.dealId}</div>
                      <div className="text-xs text-slate-500">
                        Items: {active.items.length} · Open: {active.open}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        className={`${buttonSoft} rounded-md px-3 py-2 text-sm`}
                        onClick={() => {
                          localStorage.setItem(ACTIVE_DEAL_KEY, active.dealId);
                          setSelectedDeal(active.dealId);
                        }}
                      >
                        Set as Active Deal
                      </button>
                      <button
                        className={`${buttonPrimary} rounded-md px-3 py-2 text-sm`}
                        onClick={() => openInCounter(active.latest)}
                      >
                        Open Latest in Counter
                      </button>
                    </div>
                  </div>

                  {/* Cargo order */}
                  <div className="mt-4">
                    <div className="text-sm font-medium">Cargo order</div>
                    {active.cargoOrder ? (
                      <>
                        <div className="mt-1 text-xs text-slate-500">{formatDate(active.cargoOrder.createdAt)}</div>
                        <pre className="mt-2 whitespace-pre-wrap text-sm border border-slate-200 rounded-md p-3 bg-slate-50 max-h-[220px] overflow-auto">
                          {active.cargoOrder.body}
                        </pre>
                        <div className="mt-2 flex gap-2">
                          <button className={`${buttonSoft} rounded-md px-3 py-2 text-sm`} onClick={() => copyText(active.cargoOrder!.body)}>
                            Copy cargo order
                          </button>
                          <button className={`${buttonSoft} rounded-md px-3 py-2 text-sm`} onClick={() => openInCounter(active.cargoOrder!)}>
                            Open in Counter
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-600 mt-2">No cargo order stored in this deal (older items may be unthreaded).</div>
                    )}
                  </div>

                  {/* Timeline */}
                  <div className="mt-5">
                    <div className="text-sm font-medium">Timeline</div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      {active.items.map((c) => (
                        <div key={c.id} className={`${border} rounded-md p-3 bg-white`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-slate-500">
                              {formatDate(c.lastUpdatedAt || c.createdAt)} · {c.status}
                              {isCargoOrder(c) ? " · Cargo Order" : ""}
                            </div>
                            <div className="flex gap-2">
                              <button className={`${buttonSoft} rounded-md px-3 py-1 text-xs`} onClick={() => openInCounter(c)}>
                                Open
                              </button>
                              <button className={`${buttonSoft} rounded-md px-3 py-1 text-xs`} onClick={() => copyText(c.body)}>
                                Copy text
                              </button>
                              {c.status === "In Progress" ? (
                                <button className={`${buttonSoft} rounded-md px-3 py-1 text-xs`} onClick={() => markFixed(c.id)}>
                                  Mark fixed
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-1 text-sm font-medium">{shortOneLine(c.subject, 120)}</div>
                          <div className="mt-1 text-xs text-slate-500">{shortOneLine(c.body, 160)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
