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
  extracted_terms?: Record<string, any>;
  raw_paste?: string;
};

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
function fmtAgeHours(iso: string) {
  const t = new Date(iso).getTime();
  const h = (Date.now() - t) / (1000 * 60 * 60);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  return `${Math.round(h)}h ago`;
}
function safe(s: any) {
  return String(s ?? "");
}
function getActiveDealId() {
  return localStorage.getItem(ACTIVE_DEAL_KEY) || "";
}
function getDealRound(memory: MemoryItem[], dealId: string) {
  if (!dealId) return 0;
  const items = memory.filter((m) => m.dealId === dealId);
  const maxRound = items.reduce((acc, it) => Math.max(acc, Number(it.round || 0)), 0);
  return maxRound;
}

// Helpers for recap formatting
function pickTerm(offer: any, key: string) {
  if (!offer) return "";
  const v = offer?.[key];
  return safe(v).trim();
}
function line(label: string, value: string) {
  const v = (value || "").trim();
  return `${label}\t${v || "—"}`;
}
function buildRecap(params: {
  dealId: string;
  round: number;
  route: string;
  cargoFamily: string;
  cargoType: string;
  size: string;
  loadBasis: string;
  offer: any;
}) {
  const { dealId, round, route, cargoFamily, cargoType, size, loadBasis, offer } = params;

  // Use extracted offer fields where available
  const laycan = pickTerm(offer, "laycan");
  const cargoQty = pickTerm(offer, "cargo_qty");
  const loadPorts = pickTerm(offer, "load_ports");
  const dischargePorts = pickTerm(offer, "discharge_ports");
  const freight = pickTerm(offer, "freight");
  const addl = pickTerm(offer, "addl_2nd_load_disch");
  const laytime = pickTerm(offer, "laytime");
  const demurrage = pickTerm(offer, "demurrage");
  const payment = pickTerm(offer, "payment");
  const heating = pickTerm(offer, "heating");
  const subjects = pickTerm(offer, "subjects_validity");
  const otherTerms = pickTerm(offer, "other_terms");

  // Commercial recap style: clean, copy-ready
  return [
    `RECAP – ${route} / ${cargoFamily}: ${cargoType} / ${size} (${loadBasis})`,
    `Deal: ${dealId || "—"}   Round: ${round || 0}`,
    ``,
    `Charterers:\tNova Carriers (Singapore) Pte Ltd`,
    `Owners:\tTBN`,
    `CP Form:\tVegoilvoy with Nova Riders (Nova Rider clauses apply)`,
    ``,
    line("Laycan", laycan),
    line("Cargo / Qty", cargoQty || `${cargoFamily}: ${cargoType}`),
    line("Load port(s)", loadPorts),
    line("Disport(s)", dischargePorts),
    line("Freight", freight),
    line("Add’l 2nd load/disch", addl),
    line("Laytime", laytime),
    line("Demurrage", demurrage),
    line("Payment", payment),
    line("Heating / Specs", heating),
    line("Subjects", subjects),
    ``,
    otherTerms ? `Others:\t${otherTerms}` : `Others:\tNova Rider clauses apply.`,
    ``,
    `*** End of Recap ***`,
  ].join("\n");
}

export default function CounterPageV11_WithRecap() {
  // Light UI
  const pageBg = "bg-slate-50";
  const cardBg = "bg-white";
  const border = "border border-slate-200";
  const buttonSoft = "border border-slate-200 bg-white hover:bg-slate-50";
  const buttonPrimary = "bg-slate-700 text-white hover:opacity-90";

  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [dealId, setDealId] = useState<string>("");

  // desk inputs
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

  // v1.1 analyze → choose → draft
  const [offer, setOffer] = useState<Record<string, any> | null>(null);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [analysisError, setAnalysisError] = useState<string>("");

  const [counterOn, setCounterOn] = useState({
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

  // Recap modal state
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapText, setRecapText] = useState("");

  useEffect(() => {
    const mem = readMemory();
    setMemory(mem);

    const aid = localStorage.getItem(ACTIVE_COUNTER_KEY) || "";
    setActiveId(aid);

    const did = getActiveDealId();
    setDealId(did);

    // if active exists, load it
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
        setCounterOn(item.extracted_terms?.counterOn || counterOn);
        setChannel(item.extracted_terms?.channel || "Email");
        setLength(item.extracted_terms?.length || "Standard");
        setAcceptanceMode(item.extracted_terms?.acceptanceMode || "Accept all else");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const options = CARGO_TYPES_BY_FAMILY[cargoFamily] || ["Other / To specify"];
    if (!options.includes(cargoType)) setCargoType(options[0]);
  }, [cargoFamily, cargoType]);

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
    const mem = readMemory();
    setMemory(mem);
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
    setCounterOn(item.extracted_terms?.counterOn || counterOn);
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
          context: {
            route,
            cargo: `${cargoFamily}: ${cargoType}`,
            size,
            loadBasis,
            tone,
          },
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

  async function generateDraft() {
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
          context: {
            route,
            cargo: `${cargoFamily}: ${cargoType}`,
            size,
            loadBasis,
            tone,
          },
          mode: "draft",
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setAnalysisError(data.message || "Draft failed. Please retry.");
        return;
      }

      setOffer(data.offer || offer || null);
      setRecommended(Array.isArray(data.recommendedCounters) ? data.recommendedCounters : recommended);

      const d = data.draft || {};
      setSubject(d.subject || "RE: Counter");
      setBody(d.body || "");
      setApiMsg("Draft generated. Review then Save.");
    } catch {
      setAnalysisError("Draft failed. Please refresh and retry.");
    } finally {
      setApiBusy(false);
    }
  }

  async function copyCounter() {
    const text = channel === "WhatsApp" ? body : `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setApiMsg("Copied.");
  }

  function saveToMemory(updateExisting = true) {
    const mem = readMemory();
    const now = new Date().toISOString();

    let activeDeal = dealId || getActiveDealId();

    if (!activeDeal) {
      activeDeal = `deal-${Date.now()}`;
      setDealId(activeDeal);
      localStorage.setItem(ACTIVE_DEAL_KEY, activeDeal);
    }

    const maxRound = getDealRound(mem, activeDeal);
    const nextRound =
      activeId && updateExisting ? mem.find((m) => m.id === activeId)?.round || maxRound : maxRound + 1;

    const item: MemoryItem = {
      id: activeId && updateExisting ? activeId : newId(),
      kind: "counter",
      createdAt: activeId && updateExisting ? mem.find((m) => m.id === activeId)?.createdAt || now : now,
      lastUpdatedAt: now,
      dealId: activeDeal,
      round: nextRound,

      route,
      cargoFamily,
      cargoType,
      size,
      loadBasis,
      mode: tone,
      status,

      subject,
      body,
      raw_paste: paste,
      extracted_terms: {
        offer: offer || {},
        recommended: recommended || [],
        counterOn,
        channel,
        length,
        acceptanceMode,
      },
    };

    const existingIdx = mem.findIndex((m) => m.id === item.id);
    if (existingIdx >= 0) mem[existingIdx] = item;
    else mem.unshift(item);

    writeMemory(mem);
    setMemory(mem);
    setActiveId(item.id);
    localStorage.setItem(ACTIVE_COUNTER_KEY, item.id);
    localStorage.setItem(ACTIVE_DEAL_KEY, activeDeal);

    setApiMsg("Saved.");
  }

  function markFixed() {
    setStatus("Completed (Fixed)");
    const mem = readMemory();
    const idx = mem.findIndex((m) => m.id === activeId);
    if (idx >= 0) {
      mem[idx].status = "Completed (Fixed)";
      mem[idx].lastUpdatedAt = new Date().toISOString();
      writeMemory(mem);
      setMemory(mem);
    }
    setApiMsg("Marked fixed.");
  }

  function generateFinalRecap() {
    if (!activeItem) return;

    // Only generate when clean fixed
    if (activeItem.status !== "Completed (Fixed)") {
      setApiMsg("Recap is available only after the deal is marked Completed (Fixed).");
      return;
    }

    const text = buildRecap({
      dealId: activeItem.dealId || dealId || "—",
      round: Number(activeItem.round || 0),
      route: activeItem.route,
      cargoFamily: activeItem.cargoFamily,
      cargoType: activeItem.cargoType,
      size: activeItem.size,
      loadBasis: activeItem.loadBasis,
      offer: activeItem.extracted_terms?.offer || offer || {},
    });

    setRecapText(text);
    setRecapOpen(true);
  }

  async function copyRecap() {
    await navigator.clipboard.writeText(recapText);
    setApiMsg("Recap copied.");
  }

  return (
    <div className={`min-h-screen ${pageBg} text-slate-900`}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Chartering Assistant</div>
            <div className="text-sm text-slate-500">Charterer Counter (v1.1)</div>
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
        <div className={`${border} ${cardBg} rounded-lg p-4`}>
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
              {openCounters.slice(0, 4).map((m) => (
                <div key={m.id} className={`${border} rounded-md p-3 bg-slate-50`}>
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
        <div className={`${border} ${cardBg} rounded-lg p-4 mt-4`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="font-semibold">Counter Workspace</div>
              <div className="text-xs text-slate-500">
                Deal: <span className="font-medium">{dealId || "—"}</span> · Current Round:{" "}
                <span className="font-medium">{currentRound}</span>
              </div>
            </div>
            <div className="text-xs text-slate-500">Flow: Paste → Analyze → Choose counters → Generate Draft → Save</div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-slate-500">Charterer tone</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                {(["Balanced", "Firmer", "Softer"] as Tone[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Channel</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                {(["Email", "WhatsApp"] as Channel[]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Length</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={length} onChange={(e) => setLength(e.target.value as Length)}>
                {(["Standard", "Short"] as Length[]).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Acceptance mode</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={acceptanceMode} onChange={(e) => setAcceptanceMode(e.target.value as AcceptanceMode)}>
                {(["Accept all else", "Others subject", "No statement"] as AcceptanceMode[]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Route</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={route} onChange={(e) => setRoute(e.target.value as Route)}>
                {ROUTES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Status</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={status} onChange={(e) => setStatus(e.target.value as CounterStatus)}>
                {(["In Progress", "Completed (Fixed)", "Dropped"] as CounterStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Cargo family</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={cargoFamily} onChange={(e) => setCargoFamily(e.target.value as CargoFamily)}>
                {CARGO_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Cargo type</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={cargoType} onChange={(e) => setCargoType(e.target.value)}>
                {(CARGO_TYPES_BY_FAMILY[cargoFamily] || ["Other / To specify"]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Size</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={size} onChange={(e) => setSize(e.target.value as Size)}>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500">Load basis</div>
              <select className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`} value={loadBasis} onChange={(e) => setLoadBasis(e.target.value as LoadBasis)}>
                {LOAD_BASIS.map((lb) => (
                  <option key={lb} value={lb}>
                    {lb}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Paste */}
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
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={generateDraft} disabled={apiBusy}>
                Generate Draft
              </button>
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={copyCounter} disabled={!body}>
                Copy
              </button>
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={() => saveToMemory(true)}>
                Save
              </button>

              {/* Recap restored: only useful after fixed */}
              <button
                className={`${buttonSoft} rounded-md px-4 py-2`}
                onClick={generateFinalRecap}
                disabled={!activeId || (activeItem?.status !== "Completed (Fixed)")}
                title={activeItem?.status !== "Completed (Fixed)" ? "Available only after Mark Fixed" : "Generate final recap"}
              >
                Generate Final Recap
              </button>

              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={markFixed} disabled={!activeId}>
                Mark Fixed
              </button>
            </div>

            {apiMsg ? <div className="mt-2 text-xs text-slate-600">{apiMsg}</div> : null}
            {analysisError ? (
              <div className="mt-2 text-sm text-red-700">
                {analysisError}
                <div className="text-xs text-slate-600 mt-1">
                  Tip: if this happens intermittently, it’s usually an OpenAI/Preview env or transient API error.
                </div>
              </div>
            ) : null}
          </div>

          {/* Offer Summary + Builder */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`${border} rounded-md p-3 bg-white`}>
              <div className="font-medium text-sm">Offer Summary</div>
              <div className="text-xs text-slate-500 mt-1">Review Owners’ current position.</div>
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

              {recommended?.length ? (
                <div className="mt-4">
                  <div className="text-sm font-medium">AI Recommendations</div>
                  <div className="text-xs text-slate-500">Optional—use as guidance, not autopilot.</div>
                  <ul className="mt-2 space-y-2 text-sm">
                    {recommended.slice(0, 5).map((r, idx) => (
                      <li key={idx} className="bg-slate-50 rounded-md p-2 border border-slate-200">
                        <div className="font-medium">{r.field?.toUpperCase()}</div>
                        <div className="text-xs text-slate-600">{r.why}</div>
                        <div className="text-xs text-slate-700 mt-1">
                          Suggested: <span className="font-medium">{r.suggested}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className={`${border} rounded-md p-3 bg-white`}>
              <div className="font-medium text-sm">Counter Builder (manager-controlled)</div>
              <div className="text-xs text-slate-500 mt-1">Choose what you want to counter, then Generate Draft.</div>

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
                      value={(counterOn as any)[k]}
                      onChange={(e) => setCounterOn((prev) => ({ ...prev, [k]: e.target.value }))}
                      placeholder="Leave blank if not countering this"
                    />
                  </div>
                ))}

                <div className="mt-2 text-xs text-slate-600">
                  Reminder: Nova Rider clauses apply (included in recap automatically once fixed).
                </div>
              </div>
            </div>
          </div>

          {/* Draft */}
          <div className="mt-6">
            <div className="font-semibold">Email Draft</div>
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
                placeholder="Draft will appear here…"
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
              <div className="font-semibold">Final Recap (copy-ready)</div>
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
                Recap is generated only for deals marked <span className="font-medium">Completed (Fixed)</span>. Includes:{" "}
                <span className="font-medium">Nova Rider clauses apply</span>.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
