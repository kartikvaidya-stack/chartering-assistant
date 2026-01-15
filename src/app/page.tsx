"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Mode = "Balanced" | "Firmer" | "Softer";
type CounterStatus = "In Progress" | "Completed (Fixed)" | "Dropped";

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

const LOAD_BASIS = ["ex-Padang", "ex-Balik", "SDS1", "SDS2", "Other"] as const;
type LoadBasis = (typeof LOAD_BASIS)[number];

const SIZES = ["12kt", "18.5kt", "30kt", "40kt", "Other"] as const;
type Size = (typeof SIZES)[number];

const CARGO_FAMILIES = ["Palms", "Lauric", "Oleo", "Bios", "Other"] as const;
type CargoFamily = (typeof CARGO_FAMILIES)[number];

const CARGO_TYPES_BY_FAMILY: Record<CargoFamily, string[]> = {
  Palms: [
    "Crude Palm Oil",
    "Crude Palm Olein",
    "RBD Palm Oil",
    "RBD Palm Olein",
    "RBD Palm Stearin",
    "Palm Fatty Acid Distillate",
  ],
  Lauric: [
    "Crude Palm Kernel Oil",
    "RBD Palm Kernel Oil",
    "RBD Palm Kernel Olein",
    "RBD Palm Kernel Stearin",
    "Split Palm Kernel Fatty Acids",
    "Palm Kernel Fatty Acid Distillate",
  ],
  Oleo: [
    "Hydrogenated Palm Stearin",
    "Fatty Acid (PFAD base)",
    "Palmitic Acid C1685 (PFAD base)",
    "Topped Palm Kernel Fatty Acid (1218) — Crude Fatty Acid 1218",
    "Fatty Acid C1618 (RBDPO base)",
    "Palmitic Acid C1685 (RPO base)",
    "Crude Glycerine",
    "Refined Glycerine",
    "Palm Stearin Fatty Acid",
    "Fatty Alcohol",
    "Split RBD Palm Stearine Fatty Acid",
    "Lauric Acid 70%",
  ],
  Bios: [
    "Empty Fruit Bunch Oil",
    "Palm Oil Mill Effluent Oil",
    "Palm Pressed Fibre Oil",
    "Spent Bleaching Earth Oil",
    "Used Cooking Oil",
    "Sludge Palm Oil",
    "Non-Edible Industrial Grade Palm Oil",
    "Food Waste",
    "Food Residue",
  ],
  Other: ["Other / To specify"],
};

type CounterMemoryItem = {
  id: string;
  kind: "counter";
  createdAt: string;
  lastUpdatedAt?: string;

  dealId?: string;

  route: Route;
  cargoFamily: CargoFamily;
  cargoType: string;

  size: Size;
  loadBasis: LoadBasis;

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
  | CounterMemoryItem;

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

function shortOneLine(s: string, max = 72) {
  const one = (s || "").replace(/\s+/g, " ").trim();
  if (!one) return "—";
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

function parseTime(iso?: string) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function timeAgoLabel(iso?: string) {
  const t = parseTime(iso);
  if (!t) return "—";
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isStale(iso?: string) {
  const t = parseTime(iso);
  if (!t) return false;
  const diffHrs = (Date.now() - t) / 3600000;
  return diffHrs >= 6;
}

function buildNudgeMessage(counter: CounterMemoryItem) {
  const subject = counter.subject?.trim() || "RE: Counter";
  return `Hi,

Ref ${subject} – kindly revert with Owners’ reply when possible.
We remain valid as per our last.

Best Regards,`;
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.trim() ? v : "—";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.map(String).join("; ") : "—";
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s === "{}" ? "—" : s;
    } catch {
      return "—";
    }
  }
  return String(v);
}

function pick(obj: Record<string, any> | null, keys: string[]): any {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim?.() !== "") return obj[k];
  }
  return undefined;
}

function termRows(terms: Record<string, any> | null): Array<{ label: string; value: string }> {
  const laycan = formatValue(pick(terms, ["laycan", "Laycan", "laycan_window"]));
  const cargoQty = formatValue(pick(terms, ["cargo_qty", "cargoQuantity", "qty", "quantity"]));
  const loadPorts = formatValue(pick(terms, ["load_ports", "loadPorts", "lport", "load_port"]));
  const dischPorts = formatValue(pick(terms, ["disch_ports", "discharge_ports", "dischPorts", "dport", "disport"]));
  const freight = formatValue(pick(terms, ["freight", "Freight", "freight_rate"]));
  const premiums = formatValue(pick(terms, ["premiums_2nd_load_disch", "premiums", "additional", "addl"]));
  const laytime = formatValue(pick(terms, ["laytime", "Laytime"]));
  const demurrage = formatValue(pick(terms, ["demurrage", "Demurrage"]));
  const payment = formatValue(pick(terms, ["payment", "Payment", "freight_payment"]));
  const subjects = formatValue(pick(terms, ["subjects", "Subjects", "subs"]));

  return [
    { label: "Laycan", value: laycan },
    { label: "Cargo / Qty", value: cargoQty },
    { label: "Load port(s)", value: loadPorts },
    { label: "Disport(s)", value: dischPorts },
    { label: "Freight", value: freight },
    { label: "Add’l 2nd load/disch", value: premiums },
    { label: "Laytime", value: laytime },
    { label: "Demurrage", value: demurrage },
    { label: "Payment", value: payment },
    { label: "Subjects", value: subjects },
  ];
}

function buildRecapText(params: {
  dealId?: string;
  route: Route;
  cargoFamily: CargoFamily;
  cargoType: string;
  size: Size;
  loadBasis: LoadBasis;
  subject: string;
  terms: Record<string, any> | null;
  emailDraft: string;
}) {
  const { dealId, route, cargoFamily, cargoType, size, loadBasis, subject, terms, emailDraft } = params;

  const isCargoOrder = Boolean(terms && (terms as any).isCargoOrder);
  const legs = (terms as any)?.legs;

  if (isCargoOrder && Array.isArray(legs) && legs.length) {
    const req = (terms as any)?.vessel_requirements || {};
    const lines: string[] = [];
    lines.push("CARGO ORDER (TRACKING RECAP)");
    if (dealId) lines.push(`Deal: ${dealId}`);
    lines.push(`Ref: ${subject || "—"}`);
    lines.push("");
    lines.push("Vessel Requirements (as advised):");
    lines.push(`- Heating: ${req.heating || "—"}`);
    lines.push(`- Age limit: ${req.ageLimitYears ? `<${req.ageLimitYears} years` : "—"}`);
    lines.push(`- P&I: ${req.pi || "—"}`);
    lines.push(`- Class: ${req.class || "—"}`);
    if (req.notes) lines.push(`- Notes: ${req.notes}`);
    lines.push("");
    lines.push("Cargo legs / parcels:");
    legs.forEach((l: any, idx: number) => {
      lines.push(`(${idx + 1}) ${l.route || "—"} | Load: ${l.load || "—"} | Disch: ${l.discharge || "—"} | Laycan: ${l.laycan || "—"} | L3C: ${l.l3c || "—"}`);
      const parcels = Array.isArray(l.parcels) ? l.parcels : [];
      if (!parcels.length) {
        lines.push("    - —");
      } else {
        parcels.forEach((p: any) => {
          lines.push(`    - ${p.qty || "—"} ${p.cargoFamily || "—"} / ${p.cargoType || "—"}`);
        });
      }
    });
    lines.push("");
    lines.push("Status: In Progress (convert to fixing recap once terms are agreed).");
    return lines.join("\n");
  }

  const laycan = formatValue(pick(terms, ["laycan", "Laycan", "laycan_window"]));
  const cargoQty = formatValue(pick(terms, ["cargo_qty", "cargoQuantity", "qty", "quantity"]));
  const loadPorts = formatValue(pick(terms, ["load_ports", "loadPorts", "lport", "load_port"]));
  const dischPorts = formatValue(pick(terms, ["disch_ports", "discharge_ports", "dischPorts", "dport", "disport"]));
  const freight = formatValue(pick(terms, ["freight", "Freight", "freight_rate"]));
  const premiums = formatValue(pick(terms, ["premiums_2nd_load_disch", "premiums", "additional", "addl"]));
  const laytime = formatValue(pick(terms, ["laytime", "Laytime"]));
  const demurrage = formatValue(pick(terms, ["demurrage", "Demurrage"]));
  const payment = formatValue(pick(terms, ["payment", "Payment", "freight_payment"]));
  const subjects = formatValue(pick(terms, ["subjects", "Subjects", "subs"]));

  const lines: string[] = [];
  lines.push("FINAL FIXING RECAP (DRAFT)");
  if (dealId) lines.push(`Deal: ${dealId}`);
  lines.push(`Ref: ${subject || "—"}`);
  lines.push("");
  lines.push(`Route         : ${route} (${loadBasis})`);
  lines.push(`Cargo         : ${cargoFamily} / ${cargoType}`);
  lines.push(`Size          : ${size}`);
  lines.push("");
  lines.push(`Laycan        : ${laycan}`);
  lines.push(`Cargo / Qty   : ${cargoQty}`);
  lines.push(`Load port(s)  : ${loadPorts}`);
  lines.push(`Disport(s)    : ${dischPorts}`);
  lines.push("");
  lines.push(`Freight       : ${freight}`);
  lines.push(`Add’l 2nd L/D  : ${premiums}`);
  lines.push(`Laytime       : ${laytime}`);
  lines.push(`Demurrage     : ${demurrage}`);
  lines.push(`Payment       : ${payment}`);
  lines.push(`Subjects      : ${subjects}`);
  lines.push("");
  lines.push("Notes:");
  lines.push("- Please verify names/parties, CP form, commissions, GA/ARB, and any special riders before circulating.");
  lines.push("");

  const tail = (emailDraft || "").trim();
  if (tail) {
    lines.push("----");
    lines.push("Latest Counter Text (for record):");
    lines.push(tail);
  }

  return lines.join("\n");
}

export default function CounterWorkspacePage() {
  const [mode, setMode] = useState<Mode>("Balanced");
  const [route, setRoute] = useState<Route>("ECI");

  const [cargoFamily, setCargoFamily] = useState<CargoFamily>("Palms");
  const [cargoType, setCargoType] = useState<string>(CARGO_TYPES_BY_FAMILY["Palms"][0]);

  const [size, setSize] = useState<Size>("12kt");
  const [loadBasis, setLoadBasis] = useState<LoadBasis>("ex-Padang");
  const [status, setStatus] = useState<CounterStatus>("In Progress");

  const [pasteText, setPasteText] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [lastAction, setLastAction] = useState<string | null>(null);

  const [extractedTerms, setExtractedTerms] = useState<Record<string, any> | null>(null);
  const [negotiationNotes, setNegotiationNotes] = useState<{
    diff_from_last: string[];
    behavior_label: string;
    strategy_note: string;
    questions_for_user: string[];
  } | null>(null);

  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [activeCounterId, setActiveCounterId] = useState<string | null>(null);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  // Recap modal
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapText, setRecapText] = useState("");
  const [recapMsg, setRecapMsg] = useState<string | null>(null);

  useEffect(() => {
    setMemory(readMemory());
    const savedActive = localStorage.getItem(ACTIVE_COUNTER_KEY);
    if (savedActive) setActiveCounterId(savedActive);

    const savedDeal = localStorage.getItem(ACTIVE_DEAL_KEY);
    if (savedDeal) setActiveDealId(savedDeal);
  }, []);

  useEffect(() => {
    const list = CARGO_TYPES_BY_FAMILY[cargoFamily] || ["Other / To specify"];
    setCargoType(list[0]);
  }, [cargoFamily]);

  const counters = useMemo(
    () => memory.filter((x) => x.kind === "counter") as CounterMemoryItem[],
    [memory]
  );

  const openCounters = useMemo(() => {
    return counters
      .filter((c) => (c.status || "In Progress") === "In Progress")
      .sort((a, b) => {
        const ta = a.lastUpdatedAt || a.createdAt;
        const tb = b.lastUpdatedAt || b.createdAt;
        return tb.localeCompare(ta);
      });
  }, [counters]);

  const openCountersThisDeal = useMemo(() => {
    if (!activeDealId) return openCounters;
    return openCounters.filter((c) => (c.dealId || c.extracted_terms?.dealId) === activeDealId);
  }, [openCounters, activeDealId]);

  const canDraft = pasteText.trim().length > 0;
  const canSave = Boolean(subject.trim() && emailDraft.trim());
  const staleCount = openCountersThisDeal.filter((c) => isStale(c.lastUpdatedAt || c.createdAt)).length;

  function refreshMemory() {
    setMemory(readMemory());
  }

  function writeAndSet(items: MemoryItem[]) {
    writeMemory(items);
    setMemory(items);
  }

  function getDealIdFromCounter(c: CounterMemoryItem) {
    return c.dealId || c.extracted_terms?.dealId || null;
  }

  function loadCounter(id: string) {
    const found = (readMemory().filter((x) => x.kind === "counter") as CounterMemoryItem[]).find((c) => c.id === id);
    if (!found) {
      setLastAction("Could not load counter (not found).");
      return;
    }

    setActiveCounterId(found.id);
    localStorage.setItem(ACTIVE_COUNTER_KEY, found.id);

    const deal = getDealIdFromCounter(found);
    if (deal) {
      setActiveDealId(deal);
      localStorage.setItem(ACTIVE_DEAL_KEY, deal);
    }

    setRoute(found.route);
    setCargoFamily(found.cargoFamily);
    setCargoType(found.cargoType);

    setSize(found.size);
    setLoadBasis(found.loadBasis);
    setMode(found.mode as Mode);
    setStatus(found.status || "In Progress");

    setSubject(found.subject || "");
    setEmailDraft(found.body || "");
    setPasteText(found.raw_paste || "");

    setExtractedTerms(found.extracted_terms || null);
    setNegotiationNotes({
      diff_from_last: found.diff_from_last || [],
      behavior_label: found.behavior_label || "Stable",
      strategy_note: found.strategy_note || "",
      questions_for_user: found.questions_for_user || [],
    });

    setLastAction("Loaded counter into workspace.");
  }

  function startNewCounter() {
    setActiveCounterId(null);
    localStorage.removeItem(ACTIVE_COUNTER_KEY);

    setMode("Balanced");
    setRoute(route); // keep route
    setCargoFamily(cargoFamily);
    setCargoType(CARGO_TYPES_BY_FAMILY[cargoFamily][0]);
    setSize(size);
    setLoadBasis(loadBasis);
    setStatus("In Progress");

    setPasteText("");
    setEmailDraft("");
    setSubject("");
    setExtractedTerms(null);
    setNegotiationNotes(null);

    setLastAction("New counter started (still under active deal).");
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
    writeAndSet(updated);
    setLastAction("Marked as Completed (Fixed).");
  }

  async function copyNudge(id: string) {
    const found = openCountersThisDeal.find((c) => c.id === id);
    if (!found) return;

    try {
      await navigator.clipboard.writeText(buildNudgeMessage(found));
      setLastAction("Copied nudge message to clipboard.");
    } catch {
      setLastAction("Could not copy nudge (browser permission).");
    }
  }

  async function draftCounter() {
    setLastAction("Drafting counter with AI...");

    try {
      const res = await fetch("/api/draft-counter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pastedText: pasteText,
          mode,
          route,
          cargoFamily,
          cargoType,
          size,
          loadBasis,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLastAction(data?.error || "Error drafting counter.");
        return;
      }

      setSubject(data.subject || `RE: Counter / ${route} / ${size}`);
      setEmailDraft(data.body || "");

      const terms = data.extracted_terms || {};
      // keep dealId attached even if AI doesn't return it
      const dealId = activeDealId || terms.dealId;
      const mergedTerms = { ...terms, ...(dealId ? { dealId } : {}) };

      setExtractedTerms(mergedTerms);
      setNegotiationNotes({
        diff_from_last: Array.isArray(data.diff_from_last) ? data.diff_from_last : [],
        behavior_label: data.behavior_label || "Stable",
        strategy_note: data.strategy_note || "",
        questions_for_user: Array.isArray(data.questions_for_user) ? data.questions_for_user : [],
      });

      setLastAction("Drafted by AI. Review before sending.");
    } catch (e: any) {
      setLastAction(e?.message || "Network error.");
    }
  }

  async function copyCounter() {
    try {
      await navigator.clipboard.writeText(emailDraft || "");
      setLastAction("Copied counter to clipboard.");
    } catch {
      setLastAction("Could not copy. (Browser permission issue)");
    }
  }

  function saveToMemory() {
    if (!canSave) return;

    const now = new Date().toISOString();
    const all = readMemory();

    const dealId = activeDealId || extractedTerms?.dealId || null;

    if (activeCounterId) {
      const updated = all.map((it) => {
        if (it.kind !== "counter") return it;
        const prev = it as CounterMemoryItem;
        if (prev.id !== activeCounterId) return it;

        const merged: CounterMemoryItem = {
          ...prev,
          lastUpdatedAt: now,

          dealId: dealId || prev.dealId || prev.extracted_terms?.dealId,

          route,
          cargoFamily,
          cargoType,
          size,
          loadBasis,
          mode: String(mode),
          status,
          subject: subject.trim(),
          body: emailDraft.trim(),
          extracted_terms: extractedTerms || prev.extracted_terms,
          behavior_label: negotiationNotes?.behavior_label,
          strategy_note: negotiationNotes?.strategy_note,
          diff_from_last: negotiationNotes?.diff_from_last,
          questions_for_user: negotiationNotes?.questions_for_user,
          raw_paste: pasteText.trim() ? pasteText.trim() : prev.raw_paste,
        };

        return merged;
      });

      writeAndSet(updated);
      setLastAction(`Updated Freight Memory (${status}).`);
      return;
    }

    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const item: CounterMemoryItem = {
      id,
      kind: "counter",
      createdAt: now,
      lastUpdatedAt: now,

      dealId: dealId || undefined,

      route,
      cargoFamily,
      cargoType,
      size,
      loadBasis,
      mode: String(mode),
      status,
      subject: subject.trim(),
      body: emailDraft.trim(),
      extracted_terms: extractedTerms ? { ...extractedTerms, ...(dealId ? { dealId } : {}) } : dealId ? { dealId } : undefined,
      behavior_label: negotiationNotes?.behavior_label,
      strategy_note: negotiationNotes?.strategy_note,
      diff_from_last: negotiationNotes?.diff_from_last,
      questions_for_user: negotiationNotes?.questions_for_user,
      raw_paste: pasteText.trim() ? pasteText.trim() : undefined,
    };

    all.unshift(item);
    writeAndSet(all);

    setActiveCounterId(id);
    localStorage.setItem(ACTIVE_COUNTER_KEY, id);

    if (dealId) {
      setActiveDealId(dealId);
      localStorage.setItem(ACTIVE_DEAL_KEY, dealId);
    }

    setLastAction(`Saved new counter to Freight Memory (${status}).`);
  }

  function openRecapModal() {
    const txt = buildRecapText({
      dealId: activeDealId || undefined,
      route,
      cargoFamily,
      cargoType,
      size,
      loadBasis,
      subject,
      terms: extractedTerms,
      emailDraft,
    });
    setRecapText(txt);
    setRecapMsg(null);
    setRecapOpen(true);
  }

  async function copyRecap() {
    try {
      await navigator.clipboard.writeText(recapText || "");
      setRecapMsg("Copied recap to clipboard.");
    } catch {
      setRecapMsg("Could not copy (browser permission).");
    }
  }

  // Light UI
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
            <div className="text-sm text-slate-500">Charterer Counter</div>
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
        {/* Active deal strip */}
        <section className={`${border} ${cardBg} rounded-lg p-4`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">Active deal</div>
              <div className="text-xs text-slate-500">
                {activeDealId ? (
                  <>
                    Deal: <span className="font-semibold text-slate-900">{activeDealId}</span>{" "}
                    · Open counters in this deal:{" "}
                    <span className="font-semibold text-slate-900">{openCountersThisDeal.length}</span>{" "}
                    · Stale (6h+): <span className="font-semibold text-slate-900">{staleCount}</span>
                  </>
                ) : (
                  "No active deal yet. Create a cargo order to start a threaded negotiation."
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Link className={`${buttonSoft} rounded-md px-4 py-2`} href="/cargo-order">
                New Cargo Order
              </Link>
              <Link className={`${buttonSoft} rounded-md px-4 py-2`} href="/deal">
                Deal Board
              </Link>
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={refreshMemory}>
                Refresh
              </button>
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={startNewCounter}>
                Start New
              </button>
            </div>
          </div>

          {openCountersThisDeal.length ? (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {openCountersThisDeal.slice(0, 10).map((c) => {
                const last = c.lastUpdatedAt || c.createdAt;
                const stale = isStale(last);
                const deal = c.dealId || c.extracted_terms?.dealId;
                return (
                  <div key={c.id} className={`${border} rounded-md p-3 ${c.id === activeCounterId ? "bg-slate-50" : "bg-white"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        {c.route} · {c.cargoFamily}:{` `}{shortOneLine(c.cargoType, 40)} · {c.size} · {c.loadBasis}
                      </div>
                      <div className="text-xs text-slate-500">
                        {timeAgoLabel(last)}{" "}
                        {stale ? <span className="ml-2 border border-amber-200 bg-amber-50 text-amber-700 rounded px-2 py-[1px]">Stale</span> : null}
                      </div>
                    </div>

                    {deal ? <div className="mt-1 text-xs text-slate-500">Deal: {deal}</div> : null}

                    <div className="mt-1 text-sm font-medium">{shortOneLine(c.subject || "RE: Counter")}</div>
                    <div className="mt-1 text-xs text-slate-500">{shortOneLine(c.body || "", 100)}</div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className={`${buttonSoft} rounded-md px-3 py-1 text-xs`} onClick={() => loadCounter(c.id)}>
                        Load
                      </button>
                      <button className={`${buttonSoft} rounded-md px-3 py-1 text-xs`} onClick={() => copyNudge(c.id)}>
                        Copy nudge
                      </button>
                      <button className={`${buttonSoft} rounded-md px-3 py-1 text-xs`} onClick={() => markFixed(c.id)}>
                        Mark fixed
                      </button>
                      {c.id === activeCounterId ? <span className="text-xs text-slate-500 self-center">Active</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-600">
              {activeDealId
                ? "No open counters in this deal (or none saved yet)."
                : "Create a cargo order to start a deal thread."}
            </div>
          )}
        </section>

        {/* Controls */}
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Charterer tone</label>
              <select className={`rounded-md px-3 py-2 ${border} bg-white`} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option>Balanced</option>
                <option>Firmer</option>
                <option>Softer</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Route</label>
              <select className={`rounded-md px-3 py-2 ${border} bg-white`} value={route} onChange={(e) => setRoute(e.target.value as any)}>
                {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Cargo family</label>
              <select className={`rounded-md px-3 py-2 ${border} bg-white`} value={cargoFamily} onChange={(e) => setCargoFamily(e.target.value as CargoFamily)}>
                {CARGO_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-[260px]">
              <label className="text-xs text-slate-500">Cargo type</label>
              <select className={`rounded-md px-3 py-2 ${border} bg-white`} value={cargoType} onChange={(e) => setCargoType(e.target.value)}>
                {(CARGO_TYPES_BY_FAMILY[cargoFamily] || ["Other / To specify"]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Size</label>
              <select className={`rounded-md px-3 py-2 ${border} bg-white`} value={size} onChange={(e) => setSize(e.target.value as Size)}>
                {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Load basis</label>
              <select className={`rounded-md px-3 py-2 ${border} bg-white`} value={loadBasis} onChange={(e) => setLoadBasis(e.target.value as LoadBasis)}>
                {LOAD_BASIS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Status</label>
              <select className={`rounded-md px-3 py-2 ${border} bg-white`} value={status} onChange={(e) => setStatus(e.target.value as CounterStatus)}>
                <option>In Progress</option>
                <option>Completed (Fixed)</option>
                <option>Dropped</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            {activeCounterId ? `Active counter: ${activeCounterId}` : "No active counter (new draft)."}
          </div>
        </div>

        {/* Main split */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className={`${border} ${cardBg} rounded-lg p-4`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Paste</h2>
              <div className="text-xs text-slate-500">
                {route} · {cargoFamily}:{` `}{shortOneLine(cargoType, 40)} · {size} · {loadBasis} · {mode}
              </div>
            </div>

            <textarea
              className={`mt-3 w-full min-h-[320px] rounded-md p-3 text-sm ${border} bg-white`}
              placeholder="Paste broker/owner email chain or WhatsApp text…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />

            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <button
                className={`rounded-md px-4 py-2 text-sm ${
                  canDraft ? buttonPrimary : "bg-slate-200 text-slate-500 cursor-not-allowed"
                }`}
                disabled={!canDraft}
                onClick={draftCounter}
              >
                Draft Counter
              </button>

              <div className="text-xs text-slate-500">{lastAction ? lastAction : "Paste → Draft → Copy → Save (stays in this deal)"}</div>
            </div>
          </section>

          <section className={`${border} ${cardBg} rounded-lg p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Email Draft</h2>
              <button className={`${buttonSoft} rounded-md px-3 py-2 text-sm`} onClick={openRecapModal}>
                Generate Final Recap
              </button>
            </div>

            <div className="mt-3">
              <label className="text-xs text-slate-500">Subject</label>
              <input
                className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="RE: ..."
              />
            </div>

            <div className="mt-3">
              <label className="text-xs text-slate-500">Body</label>
              <textarea
                className={`mt-1 w-full min-h-[220px] rounded-md p-3 text-sm whitespace-pre-wrap ${border} bg-white`}
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="Draft will appear here…"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className={`${buttonSoft} rounded-md px-4 py-2 text-sm`} onClick={copyCounter} disabled={!emailDraft}>
                Copy Counter
              </button>

              <button
                className={`rounded-md px-4 py-2 text-sm ${canSave ? buttonSoft : "opacity-50 cursor-not-allowed border border-slate-200 bg-white"}`}
                onClick={saveToMemory}
                disabled={!canSave}
              >
                {activeCounterId ? "Update Freight Memory" : "Save to Freight Memory"}
              </button>

              <Link className={`${buttonSoft} rounded-md px-4 py-2 text-sm`} href="/deal">
                Deal Board
              </Link>
            </div>

            <details className={`mt-4 ${border} rounded-md p-3 bg-white`}>
              <summary className="cursor-pointer text-sm font-medium">Extracted Terms</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {termRows(extractedTerms).map((row) => (
                      <tr key={row.label} className="border-t border-slate-100">
                        <td className="py-2 pr-4 w-44 text-xs text-slate-500 align-top">{row.label}</td>
                        <td className="py-2 text-slate-900 whitespace-pre-wrap">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </div>
      </main>

      {/* Recap Modal */}
      {recapOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setRecapOpen(false)} />
          <div className={`relative w-[95vw] max-w-4xl max-h-[85vh] overflow-hidden rounded-lg ${border} bg-white shadow-lg`}>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-semibold">Final Recap</div>
                <div className="text-xs text-slate-500">Generated from latest workspace values (threaded under active deal).</div>
              </div>
              <button className={`${buttonSoft} rounded-md px-3 py-2 text-sm`} onClick={() => setRecapOpen(false)}>
                Close
              </button>
            </div>

            <div className="p-4 overflow-auto max-h-[70vh]">
              <pre className="whitespace-pre-wrap text-sm border border-slate-200 rounded-md p-4 bg-slate-50">
                {recapText}
              </pre>

              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <button className={`bg-slate-700 text-white hover:opacity-90 rounded-md px-4 py-2 text-sm`} onClick={copyRecap}>
                  Copy Recap
                </button>

                {activeCounterId ? (
                  <button
                    className={`${buttonSoft} rounded-md px-4 py-2 text-sm`}
                    onClick={() => {
                      markFixed(activeCounterId);
                      setRecapMsg("Marked fixed (Completed).");
                    }}
                  >
                    Mark Fixed
                  </button>
                ) : null}

                <div className="text-xs text-slate-500">{recapMsg || "Tip: Copy recap, then (optional) mark fixed."}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
