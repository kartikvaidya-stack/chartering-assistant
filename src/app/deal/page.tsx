"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CounterStatus = "In Progress" | "Completed (Fixed)" | "Dropped";

const STORAGE_KEY = "chartering_assistant_memory_v1";
const DEAL_LEDGER_KEY = "chartering_assistant_deal_ledger_v1_2";

type MemoryItem = {
  id: string;
  kind: "counter";
  createdAt: string;
  lastUpdatedAt?: string;
  dealId?: string;
  round?: number;
  route: string;
  cargoFamily: string;
  cargoType: string;
  size: string;
  loadBasis: string;
  status: CounterStatus;
  subject: string;
};

type DealLedger = {
  header: {
    vessel?: string;
    owners?: string;
    operator?: string;
    broker?: string;
    cp_form?: string;
    riders?: string;
  };
  terms: {
    laycan?: string;
    load_ports?: string;
    discharge_ports?: string;
    freight?: string;
    demurrage?: string;
    payment?: string;
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

export default function DealPage() {
  const [mem, setMem] = useState<MemoryItem[]>([]);
  const [ledgerMap, setLedgerMap] = useState<Record<string, DealLedger>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    setMem(readMemory());
    setLedgerMap(readLedgerMap());
  }, []);

  const fixedDeals = useMemo(() => {
    // group by dealId, take latest round
    const byDeal: Record<string, MemoryItem[]> = {};
    for (const m of mem) {
      if (!m.dealId) continue;
      if (!byDeal[m.dealId]) byDeal[m.dealId] = [];
      byDeal[m.dealId].push(m);
    }

    const rows = Object.entries(byDeal).map(([dealId, items]) => {
      const latest = items.reduce((a, b) => (Number(a.round || 0) >= Number(b.round || 0) ? a : b), items[0]);
      const ledger = ledgerMap[dealId];
      const isFixed = Boolean(ledger?.meta?.fixed) || latest.status === "Completed (Fixed)";

      return {
        dealId,
        latestRound: Number(latest.round || 0),
        route: latest.route,
        cargo: `${latest.cargoFamily}: ${latest.cargoType}`,
        size: latest.size,
        loadBasis: latest.loadBasis,
        subject: latest.subject,
        isFixed,
        vessel: safe(ledger?.header?.vessel) || "TBN",
        owners: safe(ledger?.header?.owners) || "TBN",
        laycan: safe(ledger?.terms?.laycan) || "—",
        load: safe(ledger?.terms?.load_ports) || "—",
        disch: safe(ledger?.terms?.discharge_ports) || "—",
        freight: safe(ledger?.terms?.freight) || "—",
        demurrage: safe(ledger?.terms?.demurrage) || "—",
        payment: safe(ledger?.terms?.payment) || "—",
        fixedAt: safe(ledger?.meta?.fixedAt) || "",
      };
    });

    return rows
      .filter((r) => r.isFixed)
      .sort((a, b) => (b.fixedAt || "").localeCompare(a.fixedAt || ""));
  }, [mem, ledgerMap]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return fixedDeals;
    return fixedDeals.filter((r) => {
      const hay = [
        r.dealId,
        r.route,
        r.cargo,
        r.size,
        r.loadBasis,
        r.vessel,
        r.owners,
        r.load,
        r.disch,
        r.freight,
        r.laycan,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [fixedDeals, q]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-800 bg-gradient-to-r from-slate-900 via-blue-900 to-sky-700 text-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="font-semibold">Clean Fixed Fixtures</div>
          <nav className="flex items-center gap-4 text-sm text-white/90">
            <Link className="hover:underline" href="/">Counter</Link>
            <Link className="hover:underline" href="/cargo-order">Cargo Order</Link>
            <Link className="hover:underline" href="/commentary">Daily Commentary</Link>
            <Link className="hover:underline" href="/memory">Freight Memory</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="font-semibold">Fixtures</div>
              <div className="text-xs text-slate-500">List of deals marked Fixed (team can review quickly).</div>
            </div>
            <div className="flex gap-2">
              <input
                className="w-full md:w-[360px] rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Search (vessel, owners, route, ports, freight, laycan)…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50"
                onClick={() => {
                  setMem(readMemory());
                  setLedgerMap(readLedgerMap());
                }}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Vessel</th>
                  <th className="py-2 pr-3">Route / Cargo</th>
                  <th className="py-2 pr-3">Load → Disch</th>
                  <th className="py-2 pr-3">Laycan</th>
                  <th className="py-2 pr-3">Freight</th>
                  <th className="py-2 pr-3">Owners</th>
                  <th className="py-2 pr-3">Deal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.dealId} className="border-t border-slate-200">
                    <td className="py-2 pr-3 font-medium">{r.vessel}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.route}</div>
                      <div className="text-xs text-slate-500">{r.cargo} · {r.size} · {r.loadBasis}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-xs text-slate-700">{r.load}</div>
                      <div className="text-xs text-slate-700">{r.disch}</div>
                    </td>
                    <td className="py-2 pr-3">{r.laycan}</td>
                    <td className="py-2 pr-3 font-medium">{r.freight}</td>
                    <td className="py-2 pr-3">{r.owners}</td>
                    <td className="py-2 pr-3">
                      <div className="text-xs text-slate-500">{r.dealId}</div>
                      <div className="text-xs text-slate-500">Final R{r.latestRound}</div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-sm text-slate-500">
                      No fixed fixtures found. Mark a deal Fixed on the Counter page first.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
