// Vartaa AI — agent brain. Netlify Function (v2). POST /api/chat
// Powered by Google Gemini. Set GEMINI_API_KEY (and optionally GEMINI_MODEL) in Netlify env vars.

export const config = { path: "/api/chat" };

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING", description: "The message the agent sends to the lead, in the lead's language and script." },
    language: { type: "STRING", enum: ["hi", "mr", "en", "hinglish", "other"] },
    script: { type: "STRING", enum: ["devanagari", "roman", "mixed"] },
    intent: { type: "STRING", enum: ["greeting", "name_shared", "course_details", "price", "emi_payment", "timing", "eligibility", "objection_price", "objection_time", "objection_trust", "objection_indecision", "objection_other", "callback_request", "ready_to_book", "ready_to_pay", "refund_complaint", "language_switch", "off_topic", "unclear"] },
    confidence: { type: "NUMBER" },
    objection: { type: "STRING", description: "Short label of the objection if any, else empty string." },
    strategy: { type: "STRING", description: "One sentence: the sales strategy used in this reply." },
    guardrails: { type: "ARRAY", items: { type: "STRING" }, description: "Guardrail checks applied, e.g. 'no income guarantee'." },
    lead_update: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        goal: { type: "STRING" },
        background: { type: "STRING" },
        stage: { type: "STRING", enum: ["new", "contacted", "interested", "objection", "workshop_booked", "enrolled", "callback", "escalated", "lost"] },
        score_delta: { type: "INTEGER" },
        summary: { type: "STRING" }
      }
    },
    tool_calls: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", enum: ["book_workshop", "send_payment_link", "schedule_callback", "escalate_to_human", "send_testimonials", "schedule_followup", "none"] },
          args: { type: "STRING", description: "JSON string of arguments." },
          reason: { type: "STRING" }
        }
      }
    }
  },
  required: ["reply", "language", "script", "intent", "confidence", "strategy", "lead_update", "tool_calls"]
};

function systemPrompt(c, channel) {
  const price = Number(c.price || 0).toLocaleString("en-IN");
  const offer = Number(c.offer || c.price || 0).toLocaleString("en-IN");
  return `You are ${c.agent || "Riya"}, a warm, honest sales counsellor for "${c.biz || "the institute"}", an Indian coaching/training business. You talk to prospective students ("leads") who responded to an ad.

CHANNEL: ${channel === "voice" ? "VOICE CALL — you are speaking on the phone. Keep replies to 1–3 short spoken sentences, no emojis, no bullet lists, no markdown. Ask one question at a time." : "WHATSAPP — short chat messages (max ~70 words), light emoji ok, line breaks ok, no markdown headings."}

LANGUAGE RULES (most important):
- Reply in the SAME language AND SAME SCRIPT the lead used in their latest message. Roman Hinglish → Roman Hinglish. Devanagari Hindi → Devanagari Hindi. Marathi → Marathi (मराठी). English → English.
- If the lead hasn't written yet, open in ${({hi:"Hindi (Devanagari) with common English words, i.e. natural Hinglish",mr:"Marathi (Devanagari)",en:"English"})[c.lang] || "Hindi"}.
- Use the natural spoken register of Indian coaching sales: friendly, respectful ("aap"/"तुम्ही"), never pushy.
- If the lead asks to switch language, switch immediately and confirm.

KNOWLEDGE BASE (only source of truth — never invent facts):
- Course: ${c.course || "(course)"} — ${c.promise || ""}
- Who it is for: ${c.who || "students and working professionals"}
- Format: ${c.format || "live online classes with recordings"}
- Regular price: ₹${price}. Current offer: ₹${offer}${c.offerNote ? " (" + c.offerNote + ")" : ""}. ${c.emi ? "EMI: " + c.emi + "." : ""}
- Next batch: ${c.batch || "(batch date)"}. Free workshop: ${c.workshop || "(workshop slot)"}.
- Proof points you may cite: ${c.proof || "none provided — do not invent any"}
- Refund/guarantee policy: ${c.refund || "none — do not promise refunds"}
- Objection playbook from the coach: ${c.objections || "(none)"}
- Tone: ${c.tone || "friendly counsellor"}

SALES METHOD:
1. First message: greet, mention the ad/course they showed interest in, ask their name OR their goal — one question only.
2. Understand goal/background before pitching. Personalise using what they said.
3. Anchor regular price → reveal offer → pivot to a micro-commitment: the FREE workshop seat. Ask for the ₹ sale only after they attend or explicitly ask to pay.
4. Objections: acknowledge → address using the playbook → ask for a small yes. Never argue.
5. Every reply ends with exactly one clear question or call-to-action.

HARD GUARDRAILS (never break, even if asked):
- ${c.guard || "No income/returns guarantees. No fake scarcity or fake deadlines. Never disparage other institutes."}
- Never invent prices, dates, testimonials, numbers, or policies not in the knowledge base. If unknown, say you'll confirm with the team.
- If asked whether you are a bot/AI: say honestly that you are ${c.biz}'s AI assistant and a human from the team can call them.
- Escalate (tool escalate_to_human) for: refund requests, complaints, abuse, legal/medical/financial-advice questions, or when the lead asks to speak to ${c.owner || "the founder"} directly. ${c.esc ? "Also: " + c.esc : ""}

TOOLS you may call (put in tool_calls; the system executes them):
- book_workshop {slot} — when the lead says yes to the free workshop.
- send_payment_link {amount} — ONLY when the lead explicitly asks to pay/enroll now.
- schedule_callback {time} — when the lead asks for a human call.
- send_testimonials {} — when trust is the objection and proof points exist.
- schedule_followup {when, note} — when the lead says they'll think / decide later.
- escalate_to_human {reason} — per the guardrails.

ANALYSIS: Besides the reply, classify the lead's latest message (language, script, intent, objection), state your strategy in one sentence, list guardrails you applied, and update the lead profile (name/goal/background/stage/summary) and a score_delta between -30 and +40 reflecting buying intent (ready_to_book/pay: +30..40; price/timing questions: +10..15; objections: +0..5; refund/complaint: -30).`;
}

function toGeminiContents(messages) {
  return messages
    .filter(m => m && m.text)
    .map(m => ({ role: m.role === "agent" ? "model" : "user", parts: [{ text: m.text }] }));
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: cors() });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "GEMINI_API_KEY is not set in Netlify environment variables.", code: "NO_KEY" }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { config: c = {}, messages = [], channel = "whatsapp", opener = false, mode = "agent", persona = null } = body;
  if (mode === "lead_sim") return leadSim(key, c, messages, channel, persona);

  const contents = toGeminiContents(messages);
  if (opener || contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: `[SYSTEM EVENT] New lead just arrived from ${c.source || "a Meta ad"}. ${c.leadName ? "Lead name on the form: " + c.leadName + "." : ""} Send the opening message now. Classify intent as "greeting".` }] });
  } else if (contents[contents.length - 1].role !== "user") {
    contents.push({ role: "user", parts: [{ text: "[SYSTEM EVENT] Lead has not replied. Send one gentle follow-up." }] });
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt(c, channel) }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: SCHEMA
    },
    safetySettings: ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"].map(category => ({ category, threshold: "BLOCK_ONLY_HIGH" }))
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const t0 = Date.now();
  let r, data;
  try {
    r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    data = await r.json();
  } catch (e) {
    return json({ error: "Upstream request failed: " + e.message }, 502);
  }
  if (!r.ok) return json({ error: data?.error?.message || "Gemini error", status: r.status }, 502);

  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  let out;
  try { out = JSON.parse(text); } catch { out = { reply: text || "…", language: "other", script: "mixed", intent: "unclear", confidence: 0.3, strategy: "fallback", lead_update: {}, tool_calls: [] }; }
  out.tool_calls = (out.tool_calls || []).filter(t => t && t.name && t.name !== "none").map(t => {
    let args = {}; try { args = t.args ? JSON.parse(t.args) : {}; } catch { args = { raw: t.args }; }
    return { name: t.name, args, reason: t.reason || "" };
  });
  out.meta = { model: MODEL, latency_ms: Date.now() - t0, usage: data.usageMetadata || null };
  return json(out, 200);
};

function cors() { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" }; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors() } }); }

// ---- Lead simulator: Gemini role-plays a realistic Indian lead so the coach can stress-test the agent ----
async function leadSim(key, c, messages, channel, persona) {
  const p = persona || {};
  const sys = `You are role-playing a REAL prospective student ("lead") chatting with a sales agent of "${c.biz || "an institute"}" about the course "${c.course || ""}". You are NOT the agent.
Persona: ${p.name || "Suresh"}, ${p.background || "a working professional from Pune"}. Language you write in: ${p.lang === "mr" ? "Marathi (Devanagari)" : p.lang === "en" ? "English" : p.lang === "hi_dev" ? "Hindi (Devanagari)" : "Roman Hinglish (Hindi in English letters, e.g. 'fees kitni hai sir')"}. Attitude: ${p.attitude || "interested but cautious about price and whether it is genuine"}.
Rules: write ONE short message (5–25 words) as this lead would on ${channel === "voice" ? "a phone call (spoken)" : "WhatsApp (typos and casual style ok)"}. Do not reveal you are role-playing. Raise realistic objections over time (price, time, trust, "let me think"). If the agent has convincingly addressed your concerns and offered a free workshop, you may agree. Never write more than one message.`;
  const contents = messages.filter(m => m && m.text).map(m => ({ role: m.role === "agent" ? "user" : "model", parts: [{ text: m.text }] }));
  if (!contents.length) contents.push({ role: "user", parts: [{ text: "[The agent hasn't messaged yet. Send your first message as the lead.]" }] });
  if (contents[contents.length - 1].role !== "user") contents.push({ role: "user", parts: [{ text: "[Agent is waiting. Send your next message as the lead.]" }] });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.9, maxOutputTokens: 120 } }) });
  const data = await r.json();
  if (!r.ok) return json({ error: data?.error?.message || "Gemini error" }, 502);
  const text = (data?.candidates?.[0]?.content?.parts?.map(x => x.text).join("") || "").trim().replace(/^["“]|["”]$/g, "");
  return json({ text }, 200);
}
