import OpenAI from "openai";

export const runtime = "nodejs";

type BehaviorLabel = "Firm" | "Stable" | "Testing" | "Dragging" | "RetradeRisk";
type Mode = "Balanced" | "Firmer" | "Softer";

function pickMode(mode: any): Mode {
  if (mode === "Firmer" || mode === "Softer" || mode === "Balanced") return mode;
  return "Balanced";
}

function normalizeBehaviorLabel(v: any): BehaviorLabel {
  const s = String(v || "").trim();
  if (s === "Firm" || s === "Stable" || s === "Testing" || s === "Dragging" || s === "RetradeRisk") return s;
  return "Stable";
}

// ---------- SIMPLE PRE-EXTRACTION (non-AI) ----------
// This is intentionally simple + safe. It fills only what it can see clearly.
function preExtract(text: string) {
  const t = text.replace(/\r/g, "");

  // Laycan patterns: "Laycan 26 Jan-02 Feb", "LAYCAN : 26/JAN-2/FEB", "26-31 Jan"
  const laycanMatch =
    t.match(/LAYCAN\s*[:\-]\s*([^\n]+)/i) ||
    t.match(/\bLaycan\b\s*[:\-]?\s*([^\n]+)/i) ||
    t.match(/\b(\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*[-–]\s*\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b/i) ||
    t.match(/\b(\d{1,2}\s*[-–]\s*\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b/i);

  // Freight patterns: "Freight : USD 33.00pmt basis 1/1", "FREIGHT USD 34.00 PMT"
  const freightMatch =
    t.match(/Freight\s*[:\-]\s*(USD\s*[\d.,]+\s*(?:pmt|PMT)\b[^\n]*)/i) ||
    t.match(/\bFREIGHT\b\s*[:\-]?\s*(USD\s*[\d.,]+\s*(?:pmt|PMT)\b[^\n]*)/i);

  // Premium patterns: "Additional USD 3.00pmt for 2nd load", "+1.50pmt for 2nd load port"
  const premiumLines = [];
  const premRegex = /(Additional|Add'?l|\+)\s*USD?\s*[\d.,]+\s*(?:pmt|PMT)\b[^\n]*/gi;
  let m: RegExpExecArray | null;
  while ((m = premRegex.exec(t)) !== null) {
    premiumLines.push(m[0].trim());
  }

  // Laytime patterns: "Laytime : 150/200/125 MTPH ... SHINC"
  const laytimeMatch = t.match(/Laytime\s*[:\-]\s*([^\n]+)/i);

  // Demurrage patterns: "Demurrage : USD 18,500 PDPR"
  const demMatch =
    t.match(/Demurrage\s*[:\-]\s*(USD\s*[\d,]+(?:\.\d+)?\s*PDPR[^\n]*)/i) ||
    t.match(/\bDEMURRAGE\b\s*[:\-]?\s*(USD\s*[\d,]+(?:\.\d+)?\s*PDPR[^\n]*)/i);

  // Payment patterns
  const payMatch = t.match(/Payment\s*[:\-]\s*([^\n]+)/i);

  // Ports (best-effort): look for "L/port" and "D/port" lines
  const lportMatch = t.match(/L\/port\s*[:\-]\s*([^\n]+)/i) || t.match(/\bL\/PORT\b\s*[:\-]?\s*([^\n]+)/i);
  const dportMatch = t.match(/D\/port\s*[:\-]\s*([^\n]+)/i) || t.match(/\bD\/PORT\b\s*[:\-]?\s*([^\n]+)/i);

  return {
    laycan: laycanMatch?.[1]?.trim() || "",
    freight: freightMatch?.[1]?.trim() || "",
    premiums_2nd_load_disch: premiumLines.length ? premiumLines.join(" | ") : "",
    laytime: laytimeMatch?.[1]?.trim() || "",
    demurrage: demMatch?.[1]?.trim() || "",
    payment: payMatch?.[1]?.trim() || "",
    load_ports: lportMatch?.[1]?.trim() || "",
    disch_ports: dportMatch?.[1]?.trim() || "",
    cargo_qty: "", // often not simple; let AI fill if present
    subjects: "",  // often contextual; let AI fill if present
  };
}

function mergeTerms(pre: any, ai: any) {
  const out = { ...(pre || {}) };
  const src = ai || {};
  for (const k of Object.keys(out)) {
    const preVal = String(out[k] ?? "").trim();
    const aiVal = String(src[k] ?? "").trim();
    if (!preVal && aiVal) out[k] = src[k];
  }
  // include any extra keys AI provides (without overwriting)
  for (const k of Object.keys(src)) {
    if (out[k] === undefined) out[k] = src[k];
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const pastedText: string = String(body?.pastedText ?? "");
    const mode: Mode = pickMode(body?.mode);
    const route: string = String(body?.route ?? "ECI");
    const cargo: string = String(body?.cargo ?? "CPO");
    const size: string = String(body?.size ?? "12kt");
    const loadBasis: string = String(body?.loadBasis ?? "ex-Padang");

    if (!pastedText.trim()) {
      return Response.json(
        { error: "Empty input. Paste the broker/owner message first." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const pre = preExtract(pastedText);

    const client = new OpenAI({ apiKey });

    const system = `
You are a senior PALM OIL / VEGOIL charterer (Charterer side). Write like an experienced chartering manager.
Tone: BALANCED (firm, calm, professional). Keep it concise and commercially focused.

PRIMARY OUTPUT: a copy-ready COUNTER EMAIL. Default length 3–8 lines.

HOUSE STYLE:
- Prefer: "Please maintain ..." / "Kindly confirm ..." / "Valid ... (SGT)."
- Do NOT sound like a chatbot. No analysis language in the email.
- Do NOT restate unchanged terms. Only mention items that are being negotiated or clarified.
- Do NOT paste back the whole chain.
- If you do not have enough info to counter safely, ask up to 2 short clarification questions instead of inventing numbers.

EXTRACTION REQUIREMENT:
Return extracted_terms using this schema EXACTLY (fill what you can from the pasted text; leave unknown as empty string):
{
  "laycan": "",
  "cargo_qty": "",
  "load_ports": "",
  "disch_ports": "",
  "freight": "",
  "premiums_2nd_load_disch": "",
  "laytime": "",
  "demurrage": "",
  "payment": "",
  "subjects": ""
}

OUTPUT FORMAT (MUST be JSON object) with keys exactly:
{
  "subject": "...",
  "body": "...",
  "extracted_terms": { schema above },
  "diff_from_last": ["..."],
  "behavior_label": "Firm|Stable|Testing|Dragging|RetradeRisk",
  "strategy_note": "...",
  "questions_for_user": ["..."]
}
`;

    const user = `
Context tags:
- Route: ${route}
- Cargo: ${cargo}
- Size: ${size}
- Load basis: ${loadBasis}
- Mode: ${mode}

We already pre-extracted some terms (may be incomplete). Use them as hints but verify against the pasted text:
PRE_EXTRACTED_HINTS:
${JSON.stringify(pre, null, 2)}

PASTED TEXT:
${pastedText}
`;

    const resp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: mode === "Firmer" ? 0.2 : mode === "Softer" ? 0.4 : 0.3,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() },
      ],
      response_format: { type: "json_object" },
    });

    const content = resp.choices?.[0]?.message?.content ?? "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        subject: `RE: Counter / ${route} / ${size}`,
        body: String(content || ""),
        extracted_terms: {},
        diff_from_last: [],
        behavior_label: "Stable",
        strategy_note: "",
        questions_for_user: [],
      };
    }

    const mergedTerms = mergeTerms(pre, parsed.extracted_terms);

    const result = {
      subject: String(parsed.subject ?? `RE: Counter / ${route} / ${size}`),
      body: String(parsed.body ?? ""),
      extracted_terms: mergedTerms,
      diff_from_last: Array.isArray(parsed.diff_from_last) ? parsed.diff_from_last : [],
      behavior_label: normalizeBehaviorLabel(parsed.behavior_label),
      strategy_note: String(parsed.strategy_note ?? ""),
      questions_for_user: Array.isArray(parsed.questions_for_user) ? parsed.questions_for_user : [],
    };

    return Response.json(result);
  } catch (err: any) {
    return Response.json(
      { error: err?.message ?? "Unknown error in /api/draft-counter" },
      { status: 500 }
    );
  }
}
