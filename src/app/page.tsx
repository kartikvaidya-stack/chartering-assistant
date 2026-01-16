"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CounterStatus = "In Progress" | "Completed (Fixed)" | "Dropped";
type Tone = "Balanced" | "Firmer" | "Softer";
type Channel = "Email" | "WhatsApp";
type Length = "Standard" | "Short";
type AcceptanceMode = "Accept all else" | "Others subject" | "No statement";

const STORAGE_KEY = "chartering_assistant_memory_v1";
const ACTIVE_COUNTER_KEY = "chartering_assistant_active_counter_id_v1";
const ACTIVE_DEAL_KEY = "chartering_assistant_active_deal_id_v1";
const DEAL_LEDGER_KEY = "chartering_assistant_deal_ledger_v1_1_2";

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

type ExtractedOffer = {
  laycan?: string;
  cargo_qty?: string;
  load_ports?: string;
  discharge_ports?: string;
  freight?: string;
  addl_2nd_load_disch?: string;
  laytime?: string;
  demurrage?: string;
  payment?: string;
  heating?: string;
  subjects_validity?: string;
  other_terms?: string;
};

type CounterOn = {
  freight?: string;
  demurrage?: string;
  laycan?: string;
  heating?: string;
  payment?: string;
  other?: string;
};

type MemoryItem = {
  id: string;
  kind: "counter";
  createdAt: string;
  lastUpdatedAt?: string;
  dealId?: string;
  round?: number;
  route: Route;
  cargoFamily: CargoFamily;
  cargoType: string;
  size: Size;
  loadBasis: LoadBasis;
  mode: Tone;
  status: CounterStatus;
  subject: string;
  body: string;
  extracted_terms?: {
    offer?: ExtractedOffer;
    recommended?: any[];
    counterOn?: CounterOn;
    channel?: Channel;
    length?: Length;
    acceptanceMode?: AcceptanceMode;
  };
  raw_paste?: string;
};

type DealLedger = {
  // Consolidated (final) terms for recap
  terms: {
    laycan?: string;
    cargo_qty?: string;
    load_ports?: string;
    discharge_ports?: string;
    freight?: string;
    addl_2nd_load_disch?: string;
    laytime?: string;
    demurrage?: string;
    payment?: string;
    heating?: string;
    subjects_validity?: string;
    other_terms?: string;

    // Always apply
    nova_riders?: string; // "Nova Rider clauses apply."
  };
  meta: {
    fixed?: boolean;
    fixedAt?: string;
    fixedRound?: number;
  };
};

function safe(s: any) {
  return String(s ?? "");
}
function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
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
function getActiveDealId() {
  return localStorage.getItem(ACTIVE_DEAL_KEY) || "";
}
function getDealRound(memory: MemoryItem[], dealId: string) {
  if (!dealId) return 0;
  const items = memory.filter((m) => m.dealId === dealId);
  return items.reduce((acc, it) => Math.max(acc, Number(it.round || 0)), 0);
}
function fmtAgeHours(iso: string) {
  const t = new Date(iso).getTime();
  const h = (Date.now() - t) / (1000 * 60 * 60);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  return `${Math.round(h)}h ago`;
}

// Deal ledger persistence
function readLedgerMap(): Record<string, DealLedger> {
  try {
    const raw = localStorage.getItem(DEAL_LEDGER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeLedgerMap(map: Record<string, DealLedger>) {
  localStorage.setItem(DEAL_LEDGER_KEY, JSON.stringify(map));
}
function ensureLedger(map: Record<string, DealLedger>, dealId: string): DealLedger {
  if (!map[dealId]) {
    map[dealId] = {
      terms: { nova_riders: "Nova Rider clauses apply." },
      meta: { fixed: false },
    };
  } else {
    // ensure nova rider always present
    map[dealId].terms.nova_riders = "Nova Rider clauses apply.";
  }
  return map[dealId];
}

// Merge rules: update ledger from extracted offer + counter builder
function mergeLedger(ledger: DealLedger, offer?: ExtractedOffer, counterOn?: CounterOn) {
  const t = ledger.terms;

  // 1) If ledger term empty and offer has it, fill it (do not override existing)
  const fillIfEmpty = (key: keyof ExtractedOffer) => {
    const v = safe((offer as any)?.[key]).trim();
    if (v && !safe((t as any)[key]).trim()) (t as any)[key] = v;
  };

  [
    "laycan",
    "cargo_qty",
    "load_ports",
    "discharge_ports",
    "freight",
    "addl_2nd_load_disch",
    "laytime",
    "demurrage",
    "payment",
    "heating",
    "subjects_validity",
    "other_terms",
  ].forEach((k) => fillIfEmpty(k as keyof ExtractedOffer));

  // 2) Counter builder overrides ledger for fields explicitly entered by manager
  // (this is what captures “progress of negotiation”)
  const overrideIfProvided = (k: keyof CounterOn, mapTo: keyof DealLedger["terms"]) => {
    const v = safe((counterOn as any)?.[k]).trim();
    if (v) (t as any)[mapTo] = v;
  };

  overrideIfProvided("laycan", "laycan");
  overrideIfProvided("freight", "freight");
  overrideIfProvided("demurrage", "demurrage");
  overrideIfProvided("payment", "payment");
  overrideIfProvided("heating", "heating");
  overrideIfProvided("other", "other_terms");

  // Always present
  t.nova_riders = "Nova Rider clauses apply.";
}

function line(label: string, value: string) {
  const v = (value || "").trim();
  return `${label}\t${v || "—"}`;
}

function buildRecapFromLedger(params: {
  dealId: string;
  round: number;
  route: string;
  cargoFamily: string;
  cargoType: string;
  size: string;
  loadBasis: string;
  ledger: DealLedger;
}) {
  const { dealId, round, route, cargoFamily, cargoType, size, loadBasis, ledger } = params;
  const t = ledger.terms;

  return [
    `RECAP – ${route} / ${cargoFamily}: ${cargoType} / ${size} (${loadBasis})`,
    `Deal: ${dealId || "—"}   Final Round: ${round || 0}`,
    ``,
    `Charterers:\tNova Carriers (Singapore) Pte Ltd`,
    `Owners:\tTBN`,
    `CP Form:\tVegoilvoy with Nova Riders`,
    `Riders:\t${t.nova_riders || "Nova Rider clauses apply."}`,
    ``,
    line("Laycan", safe(t.laycan)),
    line("Cargo / Qty", safe(t.cargo_qty) || `${cargoFamily}: ${cargoType}`),
    line("Load port(s)", safe(t.load_ports)),
    line("Disport(s)", safe(t.discharge_ports)),
    line("Freight", safe(t.freight)),
    line("Add’l 2nd load/disch", safe(t.addl_2nd_load_disch)),
    line("Laytime", safe(t.laytime)),
    line("Demurrage", safe(t.demurrage)),
    line("Payment", safe(t.payment)),
    line("Heating / Specs", safe(t.heating)),
    line("Subjects", safe(t.subjects_validity)),
    ``,
    t.other_terms ? `Others:\t${safe(t.other_terms)}` : `Others:\t${t.nova_riders || "Nova Rider clauses apply."}`,
    ``,
    `*** End of Recap ***`,
  ].join("\n");
}

export default function CounterPageV112() {
  // Light UI
  const pageBg = "bg-slate-50";
  const cardBg = "bg-white";
  const border = "border border-slate-200";
  const buttonSoft = "border border-slate-200 bg-white hover:bg-slate-50";
  const buttonPrimary = "bg-slate-700 text-white hover:opacity-90";

  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [dealId, setDealId] = useState<string>("");

  const [tone, setTone] = useState<Tone>("Balanced");
  const [channel, setChannel] = useState<Channel>("Email");
  const [length, setLength] = useState<Length>("Standard");
  const [acceptanceMode, setAcceptanceMode] = useState<AcceptanceMode>("Accept all else");

  const [route, setRoute] = useState<Route>("ECI");
  const [cargoFamily, setCargoFamily] = useState<CargoFamily>("Palms");
  const [cargoType, setCargoType] = useState<string>(CARGO_TYPES_BY_FAMILY["Palms"][0]);
  const [size, setSize] = useState<Size>("12kt");
  const [loadBasis, setLoadBasis] = useState<LoadBasis>("ex-Padang");

  const [status, setStatus] = useState<CounterStatus>("In Progress");
  const [paste, setPaste] = useState<string>("");

  const [offer, setOffer] = useState<ExtractedOffer | null>(null);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [analysisError, setAnalysisError] = useState<string>("");

  const [counterOn, setCounterOn] = useState<CounterOn>({
    freight: "",
    demurrage: "",
    laycan: "",
    heating: "",
    payment: "",
    other: "",
  });

  const [subject, setSubject] = useState<string>("RE: ...");
  const [body, setBody] = useState<string>("");
  const [apiBusy, setApiBusy] = useState<boolean>(false);
  const [apiMsg, setApiMsg] = useState<string>("");

  const [recapOpen, setRecapOpen] = useState(false);
  const [recapText, setRecapText] = useState("");

  // Ledger map is stored in localStorage; we load on-demand
  const [ledgerMap, setLedgerMap] = useState<Record<string, DealLedger>>({});

  useEffect(() => {
    const mem = readMemory();
    setMemory(mem);

    const map = readLedgerMap();
    setLedgerMap(map);

    const aid = localStorage.getItem(ACTIVE_COUNTER_KEY) || "";
    setActiveId(aid);

    const did = getActiveDealId();
    setDealId(did);

    if (aid) {
      const item = mem.find((m) => m.id === aid);
      if (item) {
        setRoute(item.route);
        setCargoFamily(item.cargoFamily);
        setCargoType(item.cargoType);
        setSize(item.size);
        setLoadBasis(item.loadBasis);
        setTone(item.mode);
        setStatus(item.status);
        setSubject(item.subject || "RE: ...");
        setBody(item.body || "");
        setPaste(item.raw_paste || "");
        setOffer(item.extracted_terms?.offer || null);
        setRecommended(item.extracted_terms?.recommended || []);
        setCounterOn(item.extracted_terms?.counterOn || {});
        setChannel(item.extracted_terms?.channel || "Email");
        setLength(item.extracted_terms?.length || "Standard");
        setAcceptanceMode(item.extracted_terms?.acceptanceMode || "Accept all else");
      }
    }
  }, []);

  useEffect(() => {
    const options = CARGO_TYPES_BY_FAMILY[cargoFamily] || ["Other / To specify"];
    if (!options.includes(cargoType)) setCargoType(options[0]);
  }, [cargoFamily]);

  const openCounters = useMemo(
    () => memory.filter((m) => m.status === "In Progress"),
    [memory]
  );

  const staleCount = useMemo(() => {
    const now = Date.now();
    return openCounters.filter((m) => {
      const t = new Date(m.lastUpdatedAt || m.createdAt).getTime();
      const hours = (now - t) / (1000 * 60 * 60);
      return hours >= 6;
    }).length;
  }, [openCounters]);

  const currentRound = useMemo(() => getDealRound(memory, dealId), [memory, dealId]);
  const activeItem = useMemo(() => memory.find((m) => m.id === activeId) || null, [memory, activeId]);

  function refreshMemory() {
    setMemory(readMemory());
    setLedgerMap(readLedgerMap());
  }

  function startNew() {
    setActiveId("");
    localStorage.removeItem(ACTIVE_COUNTER_KEY);
    setOffer(null);
    setRecommended([]);
    setAnalysisError("");
    setPaste("");
    setSubject("RE: ...");
    setBody("");
    setStatus("In Progress");
    setCounterOn({
      freight: "",
      demurrage: "",
      laycan: "",
      heating: "",
      payment: "",
      other: "",
    });
    setApiMsg("No active counter (new draft).");
  }

  function loadItem(id: string) {
    const item = memory.find((m) => m.id === id);
    if (!item) return;

    setActiveId(id);
    localStorage.setItem(ACTIVE_COUNTER_KEY, id);

    if (item.dealId) {
      setDealId(item.dealId);
      localStorage.setItem(ACTIVE_DEAL_KEY, item.dealId);
    }

    setRoute(item.route);
    setCargoFamily(item.cargoFamily);
    setCargoType(item.cargoType);
    setSize(item.size);
    setLoadBasis(item.loadBasis);
    setTone(item.mode);
    setStatus(item.status);
    setSubject(item.subject || "RE: ...");
    setBody(item.body || "");
    setPaste(item.raw_paste || "");
    setOffer(item.extracted_terms?.offer || null);
    setRecommended(item.extracted_terms?.recommended || []);
    setCounterOn(item.extracted_terms?.counterOn || {});
    setChannel(item.extracted_terms?.channel || "Email");
    setLength(item.extracted_terms?.length || "Standard");
    setAcceptanceMode(item.extracted_terms?.acceptanceMode || "Accept all else");

    setAnalysisError("");
    setApiMsg("Loaded.");
  }

  async function analyzeOffer() {
    setApiBusy(true);
    setApiMsg("");
    setAnalysisError("");

    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: paste,
          channel,
          length,
          acceptanceMode,
          counterOn: {},
          context: { route, cargo: `${cargoFamily}: ${cargoType}`, size, loadBasis, tone },
          mode: "analyze",
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setAnalysisError(data.message || "Could not analyze. Please retry.");
        setOffer(null);
        setRecommended([]);
        setApiMsg("");
        return;
      }
      setOffer(data.offer || null);
      setRecommended(Array.isArray(data.recommendedCounters) ? data.recommendedCounters : []);
      setApiMsg("Offer analyzed. Select what to counter, then Generate Draft.");
    } catch {
      setAnalysisError("Analyze failed. Please refresh and retry.");
    } finally {
      setApiBusy(false);
    }
  }

  // v1.1.2 core behaviour: Generate Draft AUTO-SAVES as a NEW round.
  async function generateDraftAndAutoSave() {
    setApiBusy(true);
    setApiMsg("");
    setAnalysisError("");

    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: paste,
          channel,
          length,
          acceptanceMode,
          counterOn,
          context: { route, cargo: `${cargoFamily}: ${cargoType}`, size, loadBasis, tone },
          mode: "draft",
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setAnalysisError(data.message || "Draft failed. Please retry.");
        return;
      }

      const newOffer: ExtractedOffer = data.offer || offer || {};
      const newRec = Array.isArray(data.recommendedCounters) ? data.recommendedCounters : recommended;

      const d = data.draft || {};
      const newSubject = safe(d.subject || "RE: Counter");
      const newBody = safe(d.body || "");

      setOffer(newOffer);
      setRecommended(newRec);
      setSubject(newSubject);
      setBody(newBody);

      // Auto-save as NEW round
      const saved = saveAsNewRound({
        newSubject,
        newBody,
        newOffer,
        newRec,
      });

      setApiMsg(`Draft generated and saved as Round ${saved.round || 0}.`);
    } catch {
      setAnalysisError("Draft failed. Please refresh and retry.");
    } finally {
      setApiBusy(false);
    }
  }

  function ensureDealId(): string {
    let did = dealId || getActiveDealId();
    if (!did) {
      did = `deal-${Date.now()}`;
      setDealId(did);
      localStorage.setItem(ACTIVE_DEAL_KEY, did);
    }
    return did;
  }

  // Update current loaded round (rarely used; editing only)
  function updateCurrentRound() {
    if (!activeId) {
      setApiMsg("No active round loaded to update.");
      return;
    }
    const mem = readMemory();
    const idx = mem.findIndex((m) => m.id === activeId);
    if (idx < 0) {
      setApiMsg("Active round not found.");
      return;
    }

    const did = ensureDealId();
    const now = new Date().toISOString();

    mem[idx] = {
      ...mem[idx],
      lastUpdatedAt: now,
      status,
      mode: tone,
      route,
      cargoFamily,
      cargoType,
      size,
      loadBasis,
      subject,
      body,
      raw_paste: paste,
      extracted_terms: {
        offer: offer || {},
        recommended: recommended || [],
        counterOn: counterOn || {},
        channel,
        length,
        acceptanceMode,
      },
    };

    writeMemory(mem);
    setMemory(mem);

    // Update ledger too
    const map = readLedgerMap();
    const ledger = ensureLedger(map, did);
    mergeLedger(ledger, offer || {}, counterOn || {});
    writeLedgerMap(map);
    setLedgerMap(map);

    setApiMsg(`Updated current round (Round ${mem[idx].round || 0}).`);
  }

  // Save as a NEW round (core for v1.1.2)
  function saveAsNewRound(payload?: {
    newSubject?: string;
    newBody?: string;
    newOffer?: ExtractedOffer;
    newRec?: any[];
  }): MemoryItem {
    const mem = readMemory();
    const did = ensureDealId();
    const now = new Date().toISOString();

    const maxRound = getDealRound(mem, did);
    const nextRound = maxRound + 1;

    const item: MemoryItem = {
      id: newId(),
      kind: "counter",
      createdAt: now,
      lastUpdatedAt: now,
      dealId: did,
      round: nextRound,

      route,
      cargoFamily,
      cargoType,
      size,
      loadBasis,
      mode: tone,
      status,

      subject: payload?.newSubject ?? subject,
      body: payload?.newBody ?? body,
      raw_paste: paste,
      extracted_terms: {
        offer: payload?.newOffer ?? (offer || {}),
        recommended: payload?.newRec ?? (recommended || []),
        counterOn: counterOn || {},
        channel,
        length,
        acceptanceMode,
      },
    };

    mem.unshift(item);
    writeMemory(mem);
    setMemory(mem);

    setActiveId(item.id);
    localStorage.setItem(ACTIVE_COUNTER_KEY, item.id);

    // Ledger update (this is what makes recap complete)
    const map = readLedgerMap();
    const ledger = ensureLedger(map, did);
    mergeLedger(ledger, item.extracted_terms?.offer || {}, item.extracted_terms?.counterOn || {});
    writeLedgerMap(map);
    setLedgerMap(map);

    return item;
  }

  function markFixed() {
    if (!activeId) {
      setApiMsg("Load a round first, then mark fixed.");
      return;
    }
    setStatus("Completed (Fixed)");

    // Update the active round status
    const mem = readMemory();
    const idx = mem.findIndex((m) => m.id === activeId);
    if (idx >= 0) {
      mem[idx].status = "Completed (Fixed)";
      mem[idx].lastUpdatedAt = new Date().toISOString();
      writeMemory(mem);
      setMemory(mem);
    }

    // Mark deal fixed in ledger
    const did = ensureDealId();
    const map = readLedgerMap();
    const ledger = ensureLedger(map, did);
    ledger.meta.fixed = true;
    ledger.meta.fixedAt = new Date().toISOString();
    ledger.meta.fixedRound = mem[idx]?.round || activeItem?.round || getDealRound(mem, did);
    writeLedgerMap(map);
    setLedgerMap(map);

    setApiMsg("Marked fixed.");
  }

  function generateFinalRecap() {
    if (!activeItem) return;
    const did = activeItem.dealId || dealId || "";
    if (!did) {
      setApiMsg("No deal found for recap.");
      return;
    }

    const map = readLedgerMap();
    const ledger = map[did];

    if (!ledger?.meta?.fixed) {
      setApiMsg("Recap is available only after the deal is marked Completed (Fixed).");
      return;
    }

    const finalRound = ledger.meta.fixedRound || getDealRound(memory, did);

    const text = buildRecapFromLedger({
      dealId: did,
      round: finalRound,
      route: activeItem.route,
      cargoFamily: activeItem.cargoFamily,
      cargoType: activeItem.cargoType,
      size: activeItem.size,
      loadBasis: activeItem.loadBasis,
      ledger,
    });

    setRecapText(text);
    setRecapOpen(true);
  }

  async function copyCounter() {
    const text = channel === "WhatsApp" ? body : `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setApiMsg("Copied.");
  }

  async function copyRecap() {
    await navigator.clipboard.writeText(recapText);
    setApiMsg("Recap copied.");
  }

  const dealLedger = useMemo(() => {
    if (!dealId) return null;
    return ledgerMap[dealId] || null;
  }, [ledgerMap, dealId]);

  return (
    <div className={`min-h-screen ${pageBg} text-slate-900`}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Chartering Assistant</div>
            <div className="text-sm text-slate-500">Counter (v1.1.2)</div>
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
        {/* Task panel */}
        <div className={`border border-slate-200 ${cardBg} rounded-lg p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">My tasks today</div>
              <div className="text-xs text-slate-500">
                Open counters: {openCounters.length} · Stale (6h+): {staleCount}
              </div>
            </div>

            <div className="flex gap-2">
              <Link className={`${buttonSoft} rounded-md px-4 py-2`} href="/cargo-order">
                New Cargo Order
              </Link>
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={refreshMemory}>
                Refresh
              </button>
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={startNew}>
                Start New
              </button>
              <Link className={`${buttonSoft} rounded-md px-4 py-2`} href="/memory">
                Memory
              </Link>
            </div>
          </div>

          {/* Open counters list */}
          {openCounters.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {openCounters.slice(0, 5).map((m) => (
                <div key={m.id} className="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {m.route} · {m.cargoFamily}: {m.cargoType} · {m.size} · {m.loadBasis}
                      </div>
                      <div className="text-xs text-slate-500">
                        Round {m.round || 0} · {fmtAgeHours(m.lastUpdatedAt || m.createdAt)}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">{safe(m.subject).slice(0, 80) || "—"}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className={`${buttonSoft} rounded-md px-3 py-2 text-sm`} onClick={() => loadItem(m.id)}>
                        Load
                      </button>
                      <button className={`${buttonSoft} rounded-md px-3 py-2 text-sm`} onClick={markFixed}>
                        Mark fixed
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">No open counters.</div>
          )}
        </div>

        {/* Workspace */}
        <div className={`border border-slate-200 ${cardBg} rounded-lg p-4 mt-4`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="font-semibold">Counter Workspace</div>
              <div className="text-xs text-slate-500">
                Deal: <span className="font-medium">{dealId || "—"}</span> · Current Round:{" "}
                <span className="font-medium">{currentRound}</span> · Fixed:{" "}
                <span className="font-medium">{dealLedger?.meta?.fixed ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              v1.1.2 rule: Generate Draft auto-saves a NEW round (round history is never overwritten).
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-slate-500">Charterer tone</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                {(["Balanced", "Firmer", "Softer"] as Tone[]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Channel</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                {(["Email", "WhatsApp"] as Channel[]).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Length</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={length} onChange={(e) => setLength(e.target.value as Length)}>
                {(["Standard", "Short"] as Length[]).map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Acceptance mode</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={acceptanceMode} onChange={(e) => setAcceptanceMode(e.target.value as AcceptanceMode)}>
                {(["Accept all else", "Others subject", "No statement"] as AcceptanceMode[]).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Route</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={route} onChange={(e) => setRoute(e.target.value as Route)}>
                {ROUTES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Status</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={status} onChange={(e) => setStatus(e.target.value as CounterStatus)}>
                {(["In Progress", "Completed (Fixed)", "Dropped"] as CounterStatus[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Cargo family</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={cargoFamily} onChange={(e) => setCargoFamily(e.target.value as CargoFamily)}>
                {CARGO_FAMILIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Cargo type</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={cargoType} onChange={(e) => setCargoType(e.target.value)}>
                {(CARGO_TYPES_BY_FAMILY[cargoFamily] || ["Other / To specify"]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Size</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={size} onChange={(e) => setSize(e.target.value as Size)}>
                {SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Load basis</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={loadBasis} onChange={(e) => setLoadBasis(e.target.value as LoadBasis)}>
                {LOAD_BASIS.map((lb) => (
                  <option key={lb} value={lb}>{lb}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Paste + actions */}
          <div className="mt-4">
            <div className="text-sm font-medium">Paste</div>
            <div className="text-xs text-slate-500">
              {route} · {cargoFamily}: {cargoType} · {size} · {loadBasis} · {tone}
            </div>
            <textarea
              className={`mt-2 w-full min-h-[160px] rounded-md p-3 text-sm ${border} bg-white`}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste broker/owner email chain or WhatsApp text…"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={`${buttonPrimary} rounded-md px-4 py-2`} onClick={analyzeOffer} disabled={apiBusy}>
                {apiBusy ? "Working…" : "Analyze Offer"}
              </button>

              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={generateDraftAndAutoSave} disabled={apiBusy}>
                Generate Draft (Auto Round)
              </button>

              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={copyCounter} disabled={!body}>
                Copy
              </button>

              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={updateCurrentRound} disabled={!activeId}>
                Update Current Round
              </button>

              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={markFixed} disabled={!activeId}>
                Mark Fixed
              </button>

              <button
                className={`${buttonSoft} rounded-md px-4 py-2`}
                onClick={generateFinalRecap}
                disabled={!dealLedger?.meta?.fixed}
                title={!dealLedger?.meta?.fixed ? "Available only after Mark Fixed" : "Generate final recap from consolidated deal ledger"}
              >
                Generate Final Recap
              </button>
            </div>

            {apiMsg ? <div className="mt-2 text-xs text-slate-600">{apiMsg}</div> : null}
            {analysisError ? (
              <div className="mt-2 text-sm text-red-700">
                {analysisError}
                <div className="text-xs text-slate-600 mt-1">
                  If intermittent: refresh once and retry (API transient errors can happen).
                </div>
              </div>
            ) : null}
          </div>

          {/* Offer summary + counter builder */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`${border} rounded-md p-3 bg-white`}>
              <div className="font-medium text-sm">Offer Summary</div>
              <div className="text-xs text-slate-500 mt-1">Extracted from the latest paste.</div>
              <div className="mt-3 text-sm">
                {offer ? (
                  <div className="space-y-2">
                    {Object.entries(offer).map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <div className="w-40 text-xs text-slate-500">{k}</div>
                        <div className="flex-1 text-sm">{safe(v) || "—"}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500">Click “Analyze Offer” to populate.</div>
                )}
              </div>
            </div>

            <div className={`${border} rounded-md p-3 bg-white`}>
              <div className="font-medium text-sm">Counter Builder (updates the deal ledger)</div>
              <div className="text-xs text-slate-500 mt-1">
                What you enter here becomes the consolidated agreed terms over multiple rounds.
              </div>

              <div className="mt-3 space-y-3">
                {[
                  ["freight", "Freight (e.g. USD 32.50 pmt bss 1/1)"],
                  ["demurrage", "Demurrage (e.g. USD 18,000 PDPR)"],
                  ["laycan", "Laycan (e.g. maintain 26–31 Jan)"],
                  ["heating", "Heating / cargo restrictions"],
                  ["payment", "Payment terms"],
                  ["other", "Other terms / remarks"],
                ].map(([k, label]) => (
                  <div key={k}>
                    <div className="text-xs text-slate-500">{label}</div>
                    <input
                      className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border}`}
                      value={safe((counterOn as any)[k])}
                      onChange={(e) => setCounterOn((prev) => ({ ...prev, [k]: e.target.value }))}
                      placeholder="Leave blank if not countering this"
                    />
                  </div>
                ))}

                <div className="mt-2 text-xs text-slate-600">
                  Nova Rider clauses apply (always included in recap).
                </div>
              </div>
            </div>
          </div>

          {/* Deal Ledger preview */}
          <div className="mt-6 border border-slate-200 rounded-md bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">Consolidated Deal Terms (Ledger)</div>
              <div className="text-xs text-slate-500">
                Source for Recap once fixed.
              </div>
            </div>
            {dealLedger ? (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {Object.entries(dealLedger.terms).map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <div className="w-44 text-xs text-slate-500">{k}</div>
                    <div className="flex-1">{safe(v) || "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-500">No ledger yet. Generate a draft to create rounds and build the ledger.</div>
            )}
          </div>

          {/* Draft */}
          <div className="mt-6">
            <div className="font-semibold">Draft</div>
            {channel === "Email" ? (
              <div className="mt-2">
                <div className="text-xs text-slate-500">Subject</div>
                <input className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border}`} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            ) : null}

            <div className="mt-3">
              <div className="text-xs text-slate-500">Body</div>
              <textarea
                className={`mt-1 w-full min-h-[180px] rounded-md p-3 text-sm ${border}`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Recap modal */}
      {recapOpen ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-lg border border-slate-200 shadow-lg">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold">Final Recap (from consolidated ledger)</div>
              <button className="text-sm text-slate-600 hover:underline" onClick={() => setRecapOpen(false)}>
                Close
              </button>
            </div>
            <div className="p-4">
              <textarea className="w-full min-h-[360px] rounded-md border border-slate-200 p-3 text-sm" value={recapText} readOnly />
              <div className="mt-3 flex gap-2 justify-end">
                <button className="px-4 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50" onClick={copyRecap}>
                  Copy Recap
                </button>
                <button className="px-4 py-2 rounded-md bg-slate-700 text-white hover:opacity-90" onClick={() => setRecapOpen(false)}>
                  Done
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Recap is available only after the deal is marked <span className="font-medium">Completed (Fixed)</span>. Includes Nova Riders.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
