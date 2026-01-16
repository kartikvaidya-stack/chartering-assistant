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
const DEAL_LEDGER_KEY = "chartering_assistant_deal_ledger_v1_2";

const ROUTES = ["ECI", "China", "WCI/Paki", "AG/Red Sea", "Africa", "Long Haul", "SEA/Philippines", "Other"] as const;
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
  vessel?: string;
  owners?: string;
  operator?: string;
  broker?: string;

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

  // allow manager to override header quickly if desired
  vessel?: string;
  owners?: string;
  operator?: string;
  broker?: string;
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
  header: {
    vessel?: string;   // MT WINNER / TBN
    owners?: string;   // EA Gibson / TBN
    operator?: string;
    broker?: string;
    cp_form?: string;  // fixed
    riders?: string;   // fixed
  };
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

// Ledger persistence
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
      header: {
        vessel: "TBN",
        owners: "TBN",
        operator: "",
        broker: "",
        cp_form: "Vegoilvoy with Charterer riders",
        riders: "Nova Rider clauses apply.",
      },
      terms: {},
      meta: { fixed: false },
    };
  } else {
    map[dealId].header = map[dealId].header || ({} as any);
    map[dealId].header.vessel = map[dealId].header.vessel || "TBN";
    map[dealId].header.owners = map[dealId].header.owners || "TBN";
    map[dealId].header.cp_form = map[dealId].header.cp_form || "Vegoilvoy with Charterer riders";
    map[dealId].header.riders = "Nova Rider clauses apply.";
  }
  return map[dealId];
}

// Best-effort extraction from paste (client-side)
function extractHeaderFromText(raw: string) {
  const text = raw || "";
  const out: Partial<ExtractedOffer> = {};

  // Vessel patterns
  // Examples: "Vessel: MT Roama 19", "MT WINNER / NOVA", "VSL MT XXX"
  const v1 = text.match(/(?:Vessel|VSL)\s*[:\-]\s*([A-Z0-9\/\-\s\.]{3,40})/i);
  const v2 = text.match(/\b(MT|M\/T|MV|M\/V)\s+([A-Z0-9][A-Z0-9\-\s]{2,25})/i);
  if (v1?.[1]) out.vessel = v1[1].trim();
  else if (v2) out.vessel = `${v2[1].toUpperCase().replace("M/T", "MT").replace("M/V", "MV")} ${v2[2].trim()}`.trim();

  // Owners patterns
  const o1 = text.match(/Registered Owners?\s*[:\-]\s*([^\n\r]{3,80})/i);
  const o2 = text.match(/\bOwners?\s*[:\-]\s*([^\n\r]{3,80})/i);
  const o3 = text.match(/B\/L issuing\s*[:\-]\s*([^\n\r]{3,80})/i);
  if (o1?.[1]) out.owners = o1[1].trim();
  else if (o2?.[1]) out.owners = o2[1].trim();
  else if (o3?.[1]) out.owners = o3[1].trim();

  // Operator
  const op = text.match(/(?:COMMERCIAL OPERATOR|Operator)\s*[:\-]\s*([^\n\r]{3,80})/i);
  if (op?.[1]) out.operator = op[1].trim();

  // Broker (try signature / company line)
  const br = text.match(/(Lighthouse Chartering|EA Gibson|E\.A\. Gibson|Gibson|Clarksons|Braemar|Ifchor|SSY)[^\n\r]*/i);
  if (br?.[0]) out.broker = br[0].trim();

  return out;
}

function mergeLedger(ledger: DealLedger, offer?: ExtractedOffer, counterOn?: CounterOn) {
  const h = ledger.header;
  const t = ledger.terms;

  // Fill header if empty from offer
  const fillHeaderIfEmpty = (key: keyof DealLedger["header"], v?: string) => {
    const val = safe(v).trim();
    if (!val) return;
    if (!safe((h as any)[key]).trim() || safe((h as any)[key]).trim() === "TBN") (h as any)[key] = val;
  };

  fillHeaderIfEmpty("vessel", offer?.vessel);
  fillHeaderIfEmpty("owners", offer?.owners);
  fillHeaderIfEmpty("operator", offer?.operator);
  fillHeaderIfEmpty("broker", offer?.broker);

  // Manager overrides header if typed
  const overrideHeader = (k: keyof CounterOn, dest: keyof DealLedger["header"]) => {
    const v = safe((counterOn as any)?.[k]).trim();
    if (v) (h as any)[dest] = v;
  };
  overrideHeader("vessel", "vessel");
  overrideHeader("owners", "owners");
  overrideHeader("operator", "operator");
  overrideHeader("broker", "broker");

  // Fill terms if empty from offer
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

  // Manager overrides (captures negotiation progress)
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

  // Always
  h.cp_form = h.cp_form || "Vegoilvoy with Charterer riders";
  h.riders = "Nova Rider clauses apply.";
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
  const h = ledger.header;
  const t = ledger.terms;

  return [
    `CLEAN FIXTURE RECAP – ${route} / ${cargoFamily}: ${cargoType} / ${size} (${loadBasis})`,
    `Deal: ${dealId || "—"}   Final Round: ${round || 0}`,
    ``,
    line("Vessel", safe(h.vessel) || "TBN"),
    line("Owners", safe(h.owners) || "TBN"),
    h.operator ? line("Operator", safe(h.operator)) : line("Operator", "—"),
    h.broker ? line("Brokers", safe(h.broker)) : line("Brokers", "—"),
    line("CP Form", safe(h.cp_form) || "Vegoilvoy"),
    line("Riders", safe(h.riders) || "Nova Rider clauses apply."),
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
    t.other_terms ? `Others:\t${safe(t.other_terms)}` : `Others:\t${safe(h.riders) || "Nova Rider clauses apply."}`,
    ``,
    `*** End of Recap ***`,
  ].join("\n");
}

function normalizeTerm(s: string) {
  return safe(s).trim().replace(/\s+/g, " ").toLowerCase();
}
function statusChip(kind: "ok" | "bad" | "missing") {
  if (kind === "ok") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (kind === "bad") return "bg-rose-50 text-rose-800 border-rose-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

export default function CounterPageV12() {
  // UI theme
  const pageBg = "bg-slate-50";
  const border = "border border-slate-200";
  const card = "bg-white";
  const headerGrad = "bg-gradient-to-r from-slate-900 via-blue-900 to-sky-700";

  const btnBlue = "bg-blue-700 text-white hover:bg-blue-800";
  const btnGreen = "bg-emerald-600 text-white hover:bg-emerald-700";
  const btnSoft = "border border-slate-200 bg-white hover:bg-slate-50";
  const btnTeal = "bg-teal-600 text-white hover:bg-teal-700";

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
  const [analysisError, setAnalysisError] = useState<string>("");

  const [counterOn, setCounterOn] = useState<CounterOn>({
    freight: "",
    demurrage: "",
    laycan: "",
    heating: "",
    payment: "",
    other: "",
    vessel: "",
    owners: "",
    operator: "",
    broker: "",
  });

  const [subject, setSubject] = useState<string>("RE: ...");
  const [body, setBody] = useState<string>("");
  const [apiBusy, setApiBusy] = useState<boolean>(false);
  const [apiMsg, setApiMsg] = useState<string>("");

  const [recapOpen, setRecapOpen] = useState(false);
  const [recapText, setRecapText] = useState("");

  const [ledgerMap, setLedgerMap] = useState<Record<string, DealLedger>>({});

  useEffect(() => {
    const mem = readMemory();
    setMemory(mem);
    setLedgerMap(readLedgerMap());

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

  const openCounters = useMemo(() => memory.filter((m) => m.status === "In Progress"), [memory]);
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
  const dealLedger = useMemo(() => (dealId ? ledgerMap[dealId] || null : null), [ledgerMap, dealId]);

  function refresh() {
    setMemory(readMemory());
    setLedgerMap(readLedgerMap());
  }

  function ensureDealId(): string {
    let did = dealId || getActiveDealId();
    if (!did) {
      did = `deal-${Date.now()}`;
      setDealId(did);
      localStorage.setItem(ACTIVE_DEAL_KEY, did);

      const map = readLedgerMap();
      ensureLedger(map, did);
      writeLedgerMap(map);
      setLedgerMap(map);
    }
    return did;
  }

  function startNew() {
    setActiveId("");
    localStorage.removeItem(ACTIVE_COUNTER_KEY);
    setOffer(null);
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
      vessel: "",
      owners: "",
      operator: "",
      broker: "",
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
    setCounterOn(item.extracted_terms?.counterOn || {});
    setChannel(item.extracted_terms?.channel || "Email");
    setLength(item.extracted_terms?.length || "Standard");
    setAcceptanceMode(item.extracted_terms?.acceptanceMode || "Accept all else");

    setApiMsg("Loaded.");
  }

  // Analyse: we keep using /api/draft, but we also client-extract vessel/owners as fallback
  async function analyzeOffer() {
    setApiBusy(true);
    setApiMsg("");
    setAnalysisError("");

    try {
      const localHdr = extractHeaderFromText(paste);

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
        setApiMsg("");
        return;
      }

      const newOffer: ExtractedOffer = { ...(data.offer || {}) };

      // Fill missing header fields from local extraction
      newOffer.vessel = newOffer.vessel || localHdr.vessel;
      newOffer.owners = newOffer.owners || localHdr.owners;
      newOffer.operator = newOffer.operator || localHdr.operator;
      newOffer.broker = newOffer.broker || localHdr.broker;

      setOffer(newOffer);

      // Update ledger immediately so header appears
      const did = ensureDealId();
      const map = readLedgerMap();
      const ledger = ensureLedger(map, did);
      mergeLedger(ledger, newOffer, counterOn);
      writeLedgerMap(map);
      setLedgerMap(map);

      setApiMsg("Offer analyzed. Use comparison table to see what’s accepted vs disagreed.");
    } catch {
      setAnalysisError("Analyze failed. Please refresh and retry.");
    } finally {
      setApiBusy(false);
    }
  }

  // Core behaviour: Generate Draft = auto-save NEW round + update ledger
  async function generateDraftAndAutoRound() {
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

      const localHdr = extractHeaderFromText(paste);
      const newOffer: ExtractedOffer = { ...(data.offer || offer || {}) };
      newOffer.vessel = newOffer.vessel || localHdr.vessel;
      newOffer.owners = newOffer.owners || localHdr.owners;
      newOffer.operator = newOffer.operator || localHdr.operator;
      newOffer.broker = newOffer.broker || localHdr.broker;

      const d = data.draft || {};
      const newSubject = safe(d.subject || "RE: Counter");
      const newBody = safe(d.body || "");

      setOffer(newOffer);
      setSubject(newSubject);
      setBody(newBody);

      const saved = saveAsNewRound({
        newSubject,
        newBody,
        newOffer,
      });

      setApiMsg(`Draft generated and saved as Round ${saved.round || 0}.`);
    } catch {
      setAnalysisError("Draft failed. Please refresh and retry.");
    } finally {
      setApiBusy(false);
    }
  }

  function saveAsNewRound(payload: { newSubject: string; newBody: string; newOffer: ExtractedOffer }): MemoryItem {
    const mem = readMemory();
    const did = ensureDealId();
    const now = new Date().toISOString();
    const nextRound = getDealRound(mem, did) + 1;

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

      subject: payload.newSubject,
      body: payload.newBody,
      raw_paste: paste,
      extracted_terms: {
        offer: payload.newOffer,
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

    // Update ledger
    const map = readLedgerMap();
    const ledger = ensureLedger(map, did);
    mergeLedger(ledger, payload.newOffer, counterOn);
    writeLedgerMap(map);
    setLedgerMap(map);

    return item;
  }

  function updateLedgerField(kind: "header" | "terms", key: string, value: string) {
    const did = ensureDealId();
    const map = readLedgerMap();
    const ledger = ensureLedger(map, did);
    if (kind === "header") (ledger.header as any)[key] = value;
    else (ledger.terms as any)[key] = value;
    writeLedgerMap(map);
    setLedgerMap(map);
  }

  function markFixed() {
    if (!activeId) {
      setApiMsg("Load a round first, then mark fixed.");
      return;
    }
    setStatus("Completed (Fixed)");

    const mem = readMemory();
    const idx = mem.findIndex((m) => m.id === activeId);
    if (idx >= 0) {
      mem[idx].status = "Completed (Fixed)";
      mem[idx].lastUpdatedAt = new Date().toISOString();
      writeMemory(mem);
      setMemory(mem);
    }

    const did = ensureDealId();
    const map = readLedgerMap();
    const ledger = ensureLedger(map, did);
    ledger.meta.fixed = true;
    ledger.meta.fixedAt = new Date().toISOString();
    ledger.meta.fixedRound = mem[idx]?.round || getDealRound(mem, did);
    writeLedgerMap(map);
    setLedgerMap(map);

    setApiMsg("Marked fixed.");
  }

  function generateFinalRecap() {
    const did = ensureDealId();
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
      route,
      cargoFamily,
      cargoType,
      size,
      loadBasis,
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

  // Comparison table between Owners offer vs Ledger terms
  const compareRows = useMemo(() => {
    const ledger = dealLedger;
    const off = offer || {};
    if (!ledger) return [];

    const rows: Array<{
      label: string;
      offerKey: keyof ExtractedOffer;
      ledgerKey: keyof DealLedger["terms"];
    }> = [
      { label: "Laycan", offerKey: "laycan", ledgerKey: "laycan" },
      { label: "Cargo / Qty", offerKey: "cargo_qty", ledgerKey: "cargo_qty" },
      { label: "Load port(s)", offerKey: "load_ports", ledgerKey: "load_ports" },
      { label: "Disport(s)", offerKey: "discharge_ports", ledgerKey: "discharge_ports" },
      { label: "Freight", offerKey: "freight", ledgerKey: "freight" },
      { label: "Add’l 2nd load/disch", offerKey: "addl_2nd_load_disch", ledgerKey: "addl_2nd_load_disch" },
      { label: "Laytime", offerKey: "laytime", ledgerKey: "laytime" },
      { label: "Demurrage", offerKey: "demurrage", ledgerKey: "demurrage" },
      { label: "Payment", offerKey: "payment", ledgerKey: "payment" },
      { label: "Heating / Specs", offerKey: "heating", ledgerKey: "heating" },
      { label: "Subjects", offerKey: "subjects_validity", ledgerKey: "subjects_validity" },
    ];

    return rows.map((r) => {
      const ov = safe((off as any)[r.offerKey]).trim();
      const lv = safe((ledger.terms as any)[r.ledgerKey]).trim();

      const missing = !ov && !lv;
      const ok = ov && lv && normalizeTerm(ov) === normalizeTerm(lv);
      const bad = (ov && lv && !ok) || (ov && !lv) || (!ov && lv);

      const state: "ok" | "bad" | "missing" = missing ? "missing" : ok ? "ok" : "bad";
      return { ...r, ov, lv, state };
    });
  }, [dealLedger, offer]);

  function acceptOwnersValue(offerKey: keyof ExtractedOffer, ledgerKey: keyof DealLedger["terms"]) {
    if (!offer) return;
    const v = safe((offer as any)[offerKey]).trim();
    updateLedgerField("terms", ledgerKey as string, v);
    setApiMsg(`Accepted Owners’ ${ledgerKey}.`);
  }

  function keepLedgerValue(ledgerKey: keyof DealLedger["terms"]) {
    const v = safe((dealLedger?.terms as any)?.[ledgerKey]).trim();
    updateLedgerField("terms", ledgerKey as string, v);
    setApiMsg(`Kept Charterers’ ${ledgerKey}.`);
  }

  // Status badge
  const statusBadgeClass =
    status === "Completed (Fixed)"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : status === "Dropped"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : "bg-blue-100 text-blue-800 border-blue-200";

  return (
    <div className={`min-h-screen ${pageBg} text-slate-900`}>
      <header className={`border-b border-slate-800 ${headerGrad} text-white`}>
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Chartering Assistant</div>
            <div className="text-sm text-white/70">v1.2</div>
            <span className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass}`}>
              {status}
            </span>
          </div>

          <nav className="flex items-center gap-4 text-sm text-white/90">
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
        <div className={`${border} ${card} rounded-xl p-4 shadow-sm`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">My tasks today</div>
              <div className="text-xs text-slate-500">
                Open counters: {openCounters.length} · Stale (6h+): {staleCount}
              </div>
            </div>
            <div className="flex gap-2">
              <Link className={`${btnSoft} rounded-md px-4 py-2`} href="/cargo-order">New Cargo Order</Link>
              <button className={`${btnSoft} rounded-md px-4 py-2`} onClick={refresh}>Refresh</button>
              <button className={`${btnSoft} rounded-md px-4 py-2`} onClick={startNew}>Start New</button>
              <Link className={`${btnSoft} rounded-md px-4 py-2`} href="/deal">Fixed Fixtures</Link>
            </div>
          </div>

          {openCounters.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {openCounters.slice(0, 5).map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 bg-slate-50 border border-slate-200 border-l-4 ${
                    m.status === "Completed (Fixed)" ? "border-l-emerald-500" : "border-l-blue-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {m.route} · {m.cargoFamily}: {m.cargoType} · {m.size} · {m.loadBasis}
                      </div>
                      <div className="text-xs text-slate-500">
                        Round {m.round || 0} · {fmtAgeHours(m.lastUpdatedAt || m.createdAt)}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">{safe(m.subject).slice(0, 90) || "—"}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className={`${btnSoft} rounded-md px-3 py-2 text-sm`} onClick={() => loadItem(m.id)}>Load</button>
                      <button className={`${btnGreen} rounded-md px-3 py-2 text-sm`} onClick={markFixed}>Mark fixed</button>
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
        <div className={`${border} ${card} rounded-xl p-4 shadow-sm mt-4`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="font-semibold">Counter Workspace</div>
              <div className="text-xs text-slate-500">
                Deal: <span className="font-medium">{dealId || "—"}</span> · Current Round:{" "}
                <span className="font-medium">{currentRound}</span>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Flow: Paste → Analyze → Compare → Adjust Ledger / Counter → Generate Draft (Auto Round) → Fixed → Recap
            </div>
          </div>

          {/* Inputs */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-slate-500">Tone</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                {(["Balanced", "Firmer", "Softer"] as Tone[]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Channel</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                {(["Email", "WhatsApp"] as Channel[]).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Length</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={length} onChange={(e) => setLength(e.target.value as Length)}>
                {(["Standard", "Short"] as Length[]).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Acceptance</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={acceptanceMode} onChange={(e) => setAcceptanceMode(e.target.value as AcceptanceMode)}>
                {(["Accept all else", "Others subject", "No statement"] as AcceptanceMode[]).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Route</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={route} onChange={(e) => setRoute(e.target.value as Route)}>
                {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Cargo family</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={cargoFamily} onChange={(e) => setCargoFamily(e.target.value as CargoFamily)}>
                {CARGO_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Cargo type</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={cargoType} onChange={(e) => setCargoType(e.target.value)}>
                {(CARGO_TYPES_BY_FAMILY[cargoFamily] || ["Other / To specify"]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Size</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={size} onChange={(e) => setSize(e.target.value as Size)}>
                {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Load basis</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={loadBasis} onChange={(e) => setLoadBasis(e.target.value as LoadBasis)}>
                {LOAD_BASIS.map((lb) => <option key={lb} value={lb}>{lb}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Status</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={status} onChange={(e) => setStatus(e.target.value as CounterStatus)}>
                {(["In Progress", "Completed (Fixed)", "Dropped"] as CounterStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Deal header */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`${border} ${card} rounded-lg p-3 bg-sky-50`}>
              <div className="font-medium text-sm text-slate-900">Deal Header (saved for recap)</div>
              <div className="text-xs text-slate-600">Auto-filled if found in paste; you can override anytime.</div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  ["vessel", "Vessel (e.g. MT WINNER / TBN)"],
                  ["owners", "Owners / B/L issuing"],
                  ["operator", "Operator (optional)"],
                  ["broker", "Broker (optional)"],
                ].map(([k, label]) => (
                  <div key={k}>
                    <div className="text-xs text-slate-600">{label}</div>
                    <input
                      className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`}
                      value={safe((dealLedger?.header as any)?.[k])}
                      onChange={(e) => updateLedgerField("header", k, e.target.value)}
                      placeholder="TBN / leave blank"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-2 text-xs text-slate-600">
                Riders: <span className="font-medium">Nova Rider clauses apply.</span>
              </div>
            </div>

            {/* Paste */}
            <div className={`${border} ${card} rounded-lg p-3`}>
              <div className="font-medium text-sm">Paste</div>
              <div className="text-xs text-slate-500">
                {route} · {cargoFamily}: {cargoType} · {size} · {loadBasis} · {tone}
              </div>

              <textarea
                className={`mt-2 w-full min-h-[150px] rounded-md p-3 text-sm ${border} bg-white`}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Paste broker/owner email chain or WhatsApp text…"
              />

              <div className="mt-2 flex flex-wrap gap-2">
                <button className={`${btnBlue} rounded-md px-4 py-2`} onClick={analyzeOffer} disabled={apiBusy}>
                  {apiBusy ? "Working…" : "Analyze"}
                </button>
                <button className={`${btnBlue} rounded-md px-4 py-2`} onClick={generateDraftAndAutoRound} disabled={apiBusy}>
                  Generate Draft (Auto Round)
                </button>
                <button className={`${btnSoft} rounded-md px-4 py-2`} onClick={copyCounter} disabled={!body}>
                  Copy Draft
                </button>
                <button className={`${btnGreen} rounded-md px-4 py-2`} onClick={markFixed} disabled={!activeId}>
                  Mark Fixed
                </button>
                <button className={`${btnTeal} rounded-md px-4 py-2`} onClick={generateFinalRecap} disabled={!dealLedger?.meta?.fixed}>
                  Generate Recap
                </button>
              </div>

              {apiMsg ? <div className="mt-2 text-xs text-slate-700">{apiMsg}</div> : null}
              {analysisError ? <div className="mt-2 text-sm text-rose-700">{analysisError}</div> : null}
            </div>
          </div>

          {/* Compare + Counter Builder */}
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className={`${border} ${card} rounded-lg p-3`}>
              <div className="font-medium text-sm">Owners vs Charterers (Ledger) – What’s accepted vs disputed</div>
              <div className="text-xs text-slate-500">Green = aligned. Red = disagreement. Amber = missing.</div>

              <div className="mt-3 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="py-2 pr-2">Term</th>
                      <th className="py-2 pr-2">Owners</th>
                      <th className="py-2 pr-2">Charterers (Ledger)</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Quick actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((r) => (
                      <tr key={r.label} className="border-t border-slate-200">
                        <td className="py-2 pr-2 font-medium">{r.label}</td>
                        <td className="py-2 pr-2">{r.ov || <span className="text-slate-400">—</span>}</td>
                        <td className="py-2 pr-2">{r.lv || <span className="text-slate-400">—</span>}</td>
                        <td className="py-2 pr-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusChip(r.state)}`}>
                            {r.state === "ok" ? "Accepted" : r.state === "bad" ? "Disagree" : "Missing"}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex gap-2">
                            <button
                              className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                              onClick={() => acceptOwnersValue(r.offerKey, r.ledgerKey)}
                              disabled={!offer || !r.ov}
                              title="Copy Owners value into ledger"
                            >
                              Accept Owners
                            </button>
                            <button
                              className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                              onClick={() => keepLedgerValue(r.ledgerKey)}
                              disabled={!dealLedger}
                              title="Keep ledger value"
                            >
                              Keep Ledger
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!dealLedger ? (
                      <tr>
                        <td className="py-3 text-slate-500" colSpan={5}>
                          Analyze first to build a ledger.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${border} ${card} rounded-lg p-3 bg-emerald-50`}>
              <div className="font-medium text-sm">Counter Builder (manager-controlled)</div>
              <div className="text-xs text-slate-600">
                Enter only what you intend to counter. These entries also update the ledger when you Generate Draft.
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  ["freight", "Freight (e.g. USD 32.50 pmt bss 1/1)"],
                  ["demurrage", "Demurrage (e.g. USD 18,000 PDPR)"],
                  ["laycan", "Laycan (e.g. maintain 26–31 Jan)"],
                  ["payment", "Payment terms"],
                  ["heating", "Heating / cargo restrictions"],
                  ["other", "Other terms / remarks"],
                ].map(([k, label]) => (
                  <div key={k} className="md:col-span-1">
                    <div className="text-xs text-slate-700">{label}</div>
                    <input
                      className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`}
                      value={safe((counterOn as any)[k])}
                      onChange={(e) => setCounterOn((prev) => ({ ...prev, [k]: e.target.value }))}
                      placeholder="Leave blank if not countering"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Draft */}
          <div className="mt-5">
            <div className="font-semibold">Draft</div>
            {channel === "Email" ? (
              <div className="mt-2">
                <div className="text-xs text-slate-500">Subject</div>
                <input
                  className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            ) : null}

            <div className="mt-3">
              <div className="text-xs text-slate-500">Body</div>
              <textarea
                className={`mt-1 w-full min-h-[200px] rounded-md p-3 text-sm ${border} bg-white`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Draft will appear here…"
              />
            </div>
          </div>
        </div>
      </main>

      {/* Recap modal */}
      {recapOpen ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-slate-900">Clean Fixture Recap (copy-ready)</div>
              <button className="text-sm text-slate-600 hover:underline" onClick={() => setRecapOpen(false)}>Close</button>
            </div>
            <div className="p-4">
              <textarea className="w-full min-h-[360px] rounded-md border border-slate-200 p-3 text-sm" value={recapText} readOnly />
              <div className="mt-3 flex gap-2 justify-end">
                <button className={`${btnSoft} px-4 py-2 rounded-md`} onClick={copyRecap}>Copy Recap</button>
                <button className={`${btnGreen} px-4 py-2 rounded-md`} onClick={() => setRecapOpen(false)}>Done</button>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Recap is available only after the deal is marked <span className="font-medium">Completed (Fixed)</span>.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
