import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Channel = "Email" | "WhatsApp";
type Length = "Standard" | "Short";
type AcceptanceMode = "Accept all else" | "Others subject" | "No statement";

type AnalyzeRequest = {
  rawText: string;
  channel: Channel;
  length: Length;
  acceptanceMode: AcceptanceMode;
  // What the manager wants to counter (selected in UI)
  counterOn: {
    freight?: string;
    demurrage?: string;
    laycan?: string;
    heating?: string;
    payment?: string;
    other?: string;
  };
  // Optional context to keep the drafts consistent
  context?: {
    route?: string;
    cargo?: string;
    size?: string;
    loadBasis?: string;
    tone?: string; // Balanced/Firmer/Softer
  };
  // Whether this call is only "analyze offer" or also "draft"
  mode: "analyze" | "draft";
};

// A small helper: always return JSON, never raw strings.
function ok(data: any) {
  return NextResponse.json({ ok: true, ...data });
}
function fail(message: string, details?: any, status = 200) {
  // We return 200 with ok:false to avoid frontend JSON.parse crashes
  return NextResponse.json({ ok: false, message, details }, { status });
}

function safeTrim(s: unknown) {
  return String(s ?? "").trim();
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return fail("Missing OPENAI_API_KEY on server (Vercel env vars).");
    }

    const body = (await req.json()) as Partial<AnalyzeRequest>;
    const rawText = safeTrim(body.rawText);

    if (!rawText) return fail("Please paste the owners/broker text first.");

    const channel = (body.channel || "Email") as Channel;
    const length = (body.length || "Standard") as Length;
    const acceptanceMode = (body.acceptanceMode || "Accept all else") as AcceptanceMode;
    const tone = safeTrim(body.context?.tone || "Balanced");

    // 1) Extract offer summary (structured) + recommended counter points (ranked)
    // We ask the model for strict JSON ONLY.
    const extractPrompt = `
You are a senior palm/oils chartering manager assisting a CHARTERER.
Task: Extract Owners' CURRENT offer terms from the pasted text and propose recommended counter points.

Return STRICT JSON only, no markdown, no commentary.

JSON schema:
{
  "offer": {
    "laycan": string | "",
    "cargo_qty": string | "",
    "load_ports": string | "",
    "discharge_ports": string | "",
    "freight": string | "",
    "addl_2nd_load_disch": string | "",
    "laytime": string | "",
    "demurrage": string | "",
    "payment": string | "",
    "heating": string | "",
    "subjects_validity": string | "",
    "other_terms": string | ""
  },
  "recommendedCounters": [
    { "field": "freight"|"demurrage"|"laycan"|"heating"|"payment"|"other", "why": string, "suggested": string }
  ]
}

Rules:
- If a term is not present, use "".
- recommendedCounters should be practical for a charterer and written professionally.
- Keep suggested values realistic (do not invent numbers if none implied; provide phrasing if uncertain).
`;

    const extractRes = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: extractPrompt },
        { role: "user", content: rawText },
      ],
    });

    const extracted = JSON.parse(extractRes.choices[0]?.message?.content || "{}");
    const offer = extracted.offer || {};
    const recommendedCounters = Array.isArray(extracted.recommendedCounters)
      ? extracted.recommendedCounters
      : [];

    if (body.mode === "analyze") {
      return ok({ offer, recommendedCounters });
    }

    // 2) Draft counter email/WhatsApp using manager-selected counterOn fields
    const counterOn = body.counterOn || {};
    const selectedKeys = Object.keys(counterOn).filter((k) => safeTrim((counterOn as any)[k]));
    const selectionSummary =
      selectedKeys.length === 0
        ? "No specific counter points provided by Charterers. Draft a holding reply requesting Owners to confirm / clarify missing items."
        : selectedKeys
            .map((k) => `${k.toUpperCase()}: ${(counterOn as any)[k]}`)
            .join("\n");

    const acceptanceLine =
      acceptanceMode === "Accept all else"
        ? "All other terms as per Owners’ last remain accepted."
        : acceptanceMode === "Others subject"
        ? "All other terms remain subject and under review."
        : "";

    const formatRules = `
You are drafting for a CHARTERER (Chartering Manager) in a professional fixture email style.
Tone is "${tone}" but always courteous and commercial.

Channel rules:
- If channel=Email: include Subject and Body, email style, "Best Regards,".
- If channel=WhatsApp: no Subject, very short lines, no sign-off.

Length rules:
- Standard: 6–12 lines.
- Short: 3–7 lines.

Critical rules:
- Explicitly state what Charterers are countering (from selectionSummary).
- Include an "acceptance baseline" line unless acceptanceMode="No statement":
  "${acceptanceLine}"
- If Owners validity/time pressure is present, include "valid until [time] SGT" wording (do not invent exact time; say "valid 30 mins" if stated).
- Do not write like casual chat. No emojis. No slang.

Return STRICT JSON only:
{
  "subject": string,
  "body": string
}
If channel=WhatsApp, subject can be "".
`;

    const draftRes = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: formatRules },
        {
          role: "user",
          content: `OWNERS OFFER SUMMARY (if available):\n${JSON.stringify(offer, null, 2)}\n\nMANAGER COUNTER INSTRUCTIONS:\n${selectionSummary}\n\nRAW TEXT:\n${rawText}`,
        },
      ],
    });

    const drafted = JSON.parse(draftRes.choices[0]?.message?.content || "{}");
    const subject = safeTrim(drafted.subject || "RE: Counter");
    const bodyText = safeTrim(drafted.body || "");

    if (!bodyText) return fail("AI draft returned empty. Please retry.");

    return ok({ offer, recommendedCounters, draft: { subject, body: bodyText } });
  } catch (e: any) {
    // Always return JSON, never crash parsing on frontend
    return fail("AI service error. Please retry in 30 seconds.", { error: String(e?.message || e) });
  }
}
