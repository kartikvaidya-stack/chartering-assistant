"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CounterStatus = "In Progress" | "Completed (Fixed)" | "Dropped";
type Mode = "Balanced" | "Firmer" | "Softer";

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

type CargoParcel = {
  qty: string; // e.g. 600mt
  cargoFamily: CargoFamily;
  cargoType: string;
};

type CargoLeg = {
  route: Route;
  load: string;
  discharge: string;
  laycan: string;
  l3c: string;
  parcels: CargoParcel[];
};

type CounterMemoryItem = {
  id: string;
  kind: "counter";
  createdAt: string;
  lastUpdatedAt?: string;

  dealId?: string;

  // Core routing/cargo fields (for list/search)
  route: Route;
  cargoFamily: CargoFamily;
  cargoType: string;
  size: Size;
  loadBasis: LoadBasis;
  mode: string;
  status: CounterStatus;

  // Email
  subject: string;
  body: string;

  // Optional structure
  extracted_terms?: Record<string, any>;
  behavior_label?: string;
  strategy_note?: string;
  diff_from_last?: string[];
  questions_for_user?: string[];
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

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function slug(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
}

function newDealId(route: Route, load: string, disch: string) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const base = `${route}-${slug(load)}-${slug(disch)}-${y}${m}${day}`;
  return base || `deal-${y}${m}${day}-${Math.random().toString(16).slice(2, 6)}`;
}

function guessLoadBasis(loadText: string): LoadBasis {
  const t = (loadText || "").toLowerCase();
  if (t.includes("padang")) return "ex-Padang";
  if (t.includes("balik")) return "ex-Balik";
  if (t.includes("sds1")) return "SDS1";
  if (t.includes("sds2")) return "SDS2";
  return "Other";
}

function guessSizeFromParcels(parcels: CargoParcel[]): Size {
  const sum = parcels.reduce((acc, p) => {
    const n = Number(String(p.qty).replace(/[^0-9.]/g, ""));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  if (!sum) return "Other";
  if (sum <= 12000) return "12kt";
  if (sum <= 18500) return "18.5kt";
  if (sum <= 30000) return "30kt";
  if (sum <= 40000) return "40kt";
  return "Other";
}

function buildCargoOrderEmail(
  legs: CargoLeg[],
  reqs: {
    heatingSteamOnly: boolean;
    ageLimitYears: string;
    piIg: boolean;
    classIacs: boolean;
    extraNotes: string;
  }
) {
  const lines: string[] = [];

  lines.push("Hi,");
  lines.push("");
  lines.push(
    "Kindly propose suitable vessels along with the updated Q88 (with valid trading certificates) and L3C."
  );
  lines.push("");
  lines.push("Vessel Requirements (All Mandatory — highlight any deviations):");
  lines.push(`1.\tHeating: ${reqs.heatingSteamOnly ? "steam only (no thermal oil)" : "—"}`);
  lines.push(
    `2.\tAge Limit: ${reqs.ageLimitYears?.trim() ? `<${reqs.ageLimitYears.trim()} years old` : "—"}`
  );
  lines.push(`3.\tP&I: ${reqs.piIg ? "IG P&I" : "—"}`);
  lines.push(`4.\tClass: ${reqs.classIacs ? "IACS member" : "—"}`);

  if (reqs.extraNotes?.trim()) {
    lines.push("");
    lines.push("Notes:");
    lines.push(reqs.extraNotes.trim());
  }

  lines.push("");
  lines.push("______________");
  lines.push("");

  legs.forEach((leg, idx) => {
    const n = idx + 1;
    lines.push(`(${n})`);
    lines.push("Cargo Details:");

    const parcels = (leg.parcels || []).filter(
      (p) => (p.qty || "").trim() || (p.cargoType || "").trim()
    );

    if (parcels.length === 0) {
      lines.push("Parcels:\t—");
    } else if (parcels.length === 1) {
      const p = parcels[0];
      lines.push(`Quantity:\t${p.qty?.trim() || "—"} ${p.cargoFamily} / ${p.cargoType}`);
    } else {
      lines.push("Parcels:");
      parcels.forEach((p) => {
        lines.push(`- ${p.qty?.trim() || "—"} ${p.cargoFamily} / ${p.cargoType}`);
      });
    }

    lines.push(`Load:\t${leg.load?.trim() || "—"}`);
    lines.push(`Discharge:\t${leg.discharge?.trim() || "—"}`);
    lines.push(`Laycan:\t${leg.laycan?.trim() || "—"}`);
    lines.push(`L3C:\t${leg.l3c?.trim() || "—"}`);
    lines.push("");
  });

  return lines.join("\n").trim() + "\n";
}

export default function CargoOrderPage() {
  const router = useRouter();

  // Light theme
  const pageBg = "bg-slate-50";
  const cardBg = "bg-white";
  const border = "border border-slate-200";
  const buttonSoft = "border border-slate-200 bg-white hover:bg-slate-50";
  const buttonPrimary = "bg-slate-700 text-white hover:opacity-90";

  const [heatingSteamOnly, setHeatingSteamOnly] = useState(true);
  const [ageLimitYears, setAgeLimitYears] = useState("20");
  const [piIg, setPiIg] = useState(true);
  const [classIacs, setClassIacs] = useState(true);
  const [extraNotes, setExtraNotes] = useState("");

  const [legs, setLegs] = useState<CargoLeg[]>([
    {
      route: "ECI",
      load: "Padang/Straits",
      discharge: "ECI",
      laycan: "2H Jan",
      l3c: "NOBL",
      parcels: [
        {
          qty: "12,000mt",
          cargoFamily: "Palms",
          cargoType: CARGO_TYPES_BY_FAMILY["Palms"][0],
        },
      ],
    },
  ]);

  const [subjectPrefix, setSubjectPrefix] = useState("Cargo Order");
  const [lastAction, setLastAction] = useState<string | null>(null);

  const emailText = useMemo(() => {
    return buildCargoOrderEmail(legs, {
      heatingSteamOnly,
      ageLimitYears,
      piIg,
      classIacs,
      extraNotes,
    });
  }, [legs, heatingSteamOnly, ageLimitYears, piIg, classIacs, extraNotes]);

  function updateLeg(i: number, patch: Partial<CargoLeg>) {
    setLegs((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function updateParcel(legIndex: number, parcelIndex: number, patch: Partial<CargoParcel>) {
    setLegs((prev) => {
      const next = [...prev];
      const leg = next[legIndex];
      const parcels = [...(leg.parcels || [])];
      const cur = parcels[parcelIndex];
      let merged = { ...cur, ...patch };

      if (patch.cargoFamily && !patch.cargoType) {
        merged.cargoType = (CARGO_TYPES_BY_FAMILY[patch.cargoFamily] || ["Other / To specify"])[0];
      }

      parcels[parcelIndex] = merged;
      next[legIndex] = { ...leg, parcels };
      return next;
    });
  }

  function addLeg() {
    setLegs((prev) => [
      ...prev,
      {
        route: "Other",
        load: "",
        discharge: "",
        laycan: "",
        l3c: "",
        parcels: [
          {
            qty: "",
            cargoFamily: "Palms",
            cargoType: CARGO_TYPES_BY_FAMILY["Palms"][0],
          },
        ],
      },
    ]);
  }

  function removeLeg(i: number) {
    setLegs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addParcel(legIndex: number) {
    setLegs((prev) => {
      const next = [...prev];
      const leg = next[legIndex];
      const parcels = [...(leg.parcels || [])];
      parcels.push({
        qty: "",
        cargoFamily: "Palms",
        cargoType: CARGO_TYPES_BY_FAMILY["Palms"][0],
      });
      next[legIndex] = { ...leg, parcels };
      return next;
    });
  }

  function removeParcel(legIndex: number, parcelIndex: number) {
    setLegs((prev) => {
      const next = [...prev];
      const leg = next[legIndex];
      const parcels = [...(leg.parcels || [])];
      const filtered = parcels.filter((_, i) => i !== parcelIndex);
      next[legIndex] = { ...leg, parcels: filtered.length ? filtered : parcels };
      return next;
    });
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(emailText);
      setLastAction("Copied cargo order to clipboard.");
    } catch {
      setLastAction("Could not copy (browser permission).");
    }
  }

  function saveToFreightMemory() {
    const now = new Date().toISOString();
    const id = newId();

    const firstLeg = legs[0];
    const firstParcel = firstLeg?.parcels?.[0];

    const dealId = newDealId(firstLeg?.route || "Other", firstLeg?.load || "", firstLeg?.discharge || "");
    const derivedLoadBasis = guessLoadBasis(firstLeg?.load || "");
    const derivedSize = guessSizeFromParcels(firstLeg?.parcels || []);

    const subject = `${subjectPrefix}: ${firstLeg?.route || "Other"} · ${
      firstParcel ? `${firstParcel.cargoFamily}/${firstParcel.cargoType}` : "Cargo"
    }`.trim();

    const item: CounterMemoryItem = {
      id,
      kind: "counter",
      createdAt: now,
      lastUpdatedAt: now,

      dealId,

      route: firstLeg?.route || "Other",
      cargoFamily: firstParcel?.cargoFamily || "Other",
      cargoType: firstParcel?.cargoType || "Other / To specify",
      size: derivedSize,
      loadBasis: derivedLoadBasis,
      mode: "Balanced" as Mode,
      status: "In Progress" as CounterStatus,

      subject,
      body: emailText,

      extracted_terms: {
        dealId,
        isCargoOrder: true,
        vessel_requirements: {
          heating: heatingSteamOnly ? "steam only (no thermal oil)" : "",
          ageLimitYears: ageLimitYears?.trim() || "",
          pi: piIg ? "IG P&I" : "",
          class: classIacs ? "IACS member" : "",
          notes: extraNotes?.trim() || "",
        },
        legs: legs.map((l) => ({
          route: l.route,
          load: l.load,
          discharge: l.discharge,
          laycan: l.laycan,
          l3c: l.l3c,
          parcels: (l.parcels || []).map((p) => ({
            qty: p.qty,
            cargoFamily: p.cargoFamily,
            cargoType: p.cargoType,
          })),
        })),
      },

      behavior_label: "New cargo order",
      strategy_note: "Starting point of negotiation (threaded deal).",
      diff_from_last: [],
      questions_for_user: [],
      raw_paste: emailText,
    };

    const all = readMemory();
    all.unshift(item);
    writeMemory(all);

    localStorage.setItem(ACTIVE_DEAL_KEY, dealId);
    localStorage.setItem(ACTIVE_COUNTER_KEY, id);

    setLastAction("Saved to Freight Memory (Deal created). Redirecting to Counter…");
    router.push("/");
  }

  return (
    <div className={`min-h-screen ${pageBg} text-slate-900`}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Chartering Assistant</div>
            <div className="text-sm text-slate-500">Cargo Order</div>
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
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">Create Cargo Order</div>
              <div className="text-xs text-slate-500">
                Multi-parcel supported (small parcels / mixed commodities). Save creates a Deal thread.
              </div>
            </div>
            <div className="flex gap-2">
              <Link className={`${buttonSoft} rounded-md px-4 py-2`} href="/">
                Back to Counter
              </Link>
              <Link className={`${buttonSoft} rounded-md px-4 py-2`} href="/deal">
                Deals
              </Link>
              <Link className={`${buttonSoft} rounded-md px-4 py-2`} href="/memory">
                Memory
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={`${border} rounded-md p-3 bg-white`}>
              <div className="font-medium text-sm">Vessel requirements</div>

              <div className="mt-3 flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={heatingSteamOnly}
                    onChange={(e) => setHeatingSteamOnly(e.target.checked)}
                  />
                  Heating: steam only (no thermal oil)
                </label>

                <label className="flex items-center gap-2">
                  <span className="w-40 text-xs text-slate-500">Age limit (years)</span>
                  <input
                    className={`flex-1 rounded-md px-3 py-2 text-sm ${border}`}
                    value={ageLimitYears}
                    onChange={(e) => setAgeLimitYears(e.target.value)}
                    placeholder="20"
                  />
                </label>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={piIg} onChange={(e) => setPiIg(e.target.checked)} />
                  P&I: IG P&I
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={classIacs}
                    onChange={(e) => setClassIacs(e.target.checked)}
                  />
                  Class: IACS member
                </label>

                <div className="mt-2">
                  <div className="text-xs text-slate-500">Notes (optional)</div>
                  <textarea
                    className={`mt-1 w-full min-h-[90px] rounded-md p-3 text-sm ${border}`}
                    value={extraNotes}
                    onChange={(e) => setExtraNotes(e.target.value)}
                    placeholder="Any extra requirements or remarks…"
                  />
                </div>
              </div>
            </div>

            <div className={`${border} rounded-md p-3 bg-white`}>
              <div className="font-medium text-sm">Subject prefix</div>
              <div className="mt-2 text-xs text-slate-500">Used for tracking in Freight Memory</div>
              <input
                className={`mt-2 w-full rounded-md px-3 py-2 text-sm ${border}`}
                value={subjectPrefix}
                onChange={(e) => setSubjectPrefix(e.target.value)}
                placeholder="Cargo Order"
              />

              <div className="mt-4 text-sm font-medium">Actions</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={copyEmail}>
                  Copy Cargo Order
                </button>
                <button className={`${buttonPrimary} rounded-md px-4 py-2`} onClick={saveToFreightMemory}>
                  Save to Freight Memory (Create Deal)
                </button>
              </div>

              <div className="mt-3 text-xs text-slate-500">{lastAction || "Tip: Add parcels under each leg as needed."}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Cargo legs</div>
              <button className={`${buttonSoft} rounded-md px-4 py-2`} onClick={addLeg}>
                + Add leg
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              {legs.map((leg, i) => (
                <div key={i} className={`${border} rounded-md p-3 bg-white`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">({i + 1}) Leg</div>
                    {legs.length > 1 ? (
                      <button className="text-xs text-slate-600 underline" onClick={() => removeLeg(i)}>
                        remove leg
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-slate-500">Route</div>
                      <select
                        className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`}
                        value={leg.route}
                        onChange={(e) => updateLeg(i, { route: e.target.value as Route })}
                      >
                        {ROUTES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Laycan</div>
                      <input
                        className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border}`}
                        value={leg.laycan}
                        onChange={(e) => updateLeg(i, { laycan: e.target.value })}
                        placeholder="2H Jan"
                      />
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Load</div>
                      <input
                        className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border}`}
                        value={leg.load}
                        onChange={(e) => updateLeg(i, { load: e.target.value })}
                        placeholder="Padang/Straits"
                      />
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Discharge</div>
                      <input
                        className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border}`}
                        value={leg.discharge}
                        onChange={(e) => updateLeg(i, { discharge: e.target.value })}
                        placeholder="ECI"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-xs text-slate-500">L3C</div>
                      <input
                        className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border}`}
                        value={leg.l3c}
                        onChange={(e) => updateLeg(i, { l3c: e.target.value })}
                        placeholder="NOBL / Kosher"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm font-medium">Parcels (multi-commodity)</div>
                    <button className={`${buttonSoft} rounded-md px-3 py-1 text-xs`} onClick={() => addParcel(i)}>
                      + Add parcel
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {leg.parcels.map((p, j) => (
                      <div key={j} className={`${border} rounded-md p-3 bg-slate-50`}>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-slate-500">Parcel {j + 1}</div>
                          {leg.parcels.length > 1 ? (
                            <button className="text-xs text-slate-600 underline" onClick={() => removeParcel(i, j)}>
                              remove
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div>
                            <div className="text-xs text-slate-500">Quantity</div>
                            <input
                              className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`}
                              value={p.qty}
                              onChange={(e) => updateParcel(i, j, { qty: e.target.value })}
                              placeholder="600mt"
                            />
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Family</div>
                            <select
                              className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`}
                              value={p.cargoFamily}
                              onChange={(e) => updateParcel(i, j, { cargoFamily: e.target.value as CargoFamily })}
                            >
                              {CARGO_FAMILIES.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Grade / Type</div>
                            <select
                              className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${border} bg-white`}
                              value={p.cargoType}
                              onChange={(e) => updateParcel(i, j, { cargoType: e.target.value })}
                            >
                              {(CARGO_TYPES_BY_FAMILY[p.cargoFamily] || ["Other / To specify"]).map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="font-semibold">Preview</div>
            <div className="mt-2 text-xs text-slate-500">This is exactly what gets copied/saved.</div>
            <pre className={`mt-2 whitespace-pre-wrap text-sm ${border} rounded-md p-4 bg-white`}>
              {emailText}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
