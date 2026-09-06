// Vartaa AI — text-to-speech. POST /api/tts { text, lang }  → { audio: base64, mime, provider }
// Provider order: Sarvam Bulbul (SARVAM_API_KEY, best Indic voices) → Gemini TTS (GEMINI_API_KEY) → client falls back to browser voice.
export const config = { path: "/api/tts" };

const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const GEMINI_VOICE = process.env.GEMINI_VOICE || "Kore";           // female, warm. Others: Aoede, Leda, Zephyr (f) · Puck, Charon (m)
const SARVAM_SPEAKER = process.env.SARVAM_SPEAKER || "anushka";    // bulbul:v2 female Indic voice. Others: manisha, vidya, arya (f) · abhilash, karun, hitesh (m)

const LANG = { hi: "hi-IN", hinglish: "hi-IN", mr: "mr-IN", en: "en-IN" };

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: cors() });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const text = String(body.text || "").replace(/[*_#`]/g, "").slice(0, 1500);
  const lang = LANG[body.lang] || "hi-IN";
  if (!text) return json({ error: "No text" }, 400);

  if (process.env.SARVAM_API_KEY) {
    try { return json(await sarvam(text, lang), 200); } catch (e) { console.error("sarvam", e.message); }
  }
  if (process.env.GEMINI_API_KEY) {
    try { return json(await gemini(text, lang), 200); } catch (e) { console.error("gemini tts", e.message); return json({ error: "Gemini TTS failed: " + e.message }, 502); }
  }
  return json({ error: "No TTS provider configured (set SARVAM_API_KEY or GEMINI_API_KEY)" }, 500);
};

async function sarvam(text, lang) {
  const r = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-subscription-key": process.env.SARVAM_API_KEY },
    body: JSON.stringify({ text, target_language_code: lang, speaker: SARVAM_SPEAKER, model: "bulbul:v2", pace: 1.0, speech_sample_rate: 22050, output_audio_codec: "mp3" })
  });
  const d = await r.json();
  if (!r.ok || !d.audios?.[0]) throw new Error(d.error?.message || d.message || "Sarvam error " + r.status);
  return { audio: d.audios[0], mime: "audio/mpeg", provider: "sarvam-bulbul-v2" };
}

async function gemini(text, lang) {
  const langName = { "hi-IN": "Hindi", "mr-IN": "Marathi", "en-IN": "Indian English" }[lang];
  const prompt = `Speak naturally, warmly and clearly in ${langName}, like a friendly Indian sales counsellor on a phone call. Keep English words (course names, prices) pronounced naturally as an Indian speaker would:\n${text}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } } }
  }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "status " + r.status);
  const part = d.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) throw new Error("no audio returned");
  const mime = part.inlineData.mimeType || "audio/L16;rate=24000";
  const rate = Number((mime.match(/rate=(\d+)/) || [])[1] || 24000);
  const pcm = Buffer.from(part.inlineData.data, "base64");
  return { audio: pcmToWav(pcm, rate).toString("base64"), mime: "audio/wav", provider: "gemini-tts/" + GEMINI_VOICE };
}

function pcmToWav(pcm, sampleRate, channels = 1, bits = 16) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * bits / 8, 28); h.writeUInt16LE(channels * bits / 8, 32); h.writeUInt16LE(bits, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function cors() { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" }; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors() } }); }
