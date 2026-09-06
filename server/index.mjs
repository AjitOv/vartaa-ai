// Vartaa AI API — Google Cloud Run service. Wraps the same handlers used by Netlify Functions.
import express from "express";
import chat from "../netlify/functions/chat.mjs";
import tts from "../netlify/functions/tts.mjs";
import health from "../netlify/functions/health.mjs";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => { res.set("Access-Control-Allow-Origin", "*"); res.set("Access-Control-Allow-Headers", "Content-Type"); res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); if (req.method === "OPTIONS") return res.status(204).end(); next(); });

// Adapt (Express req) → (Web Request) → handler → (Web Response) → Express res
const adapt = (handler) => async (req, res) => {
  try {
    const url = `http://${req.headers.host}${req.originalUrl}`;
    const init = { method: req.method, headers: { "content-type": "application/json" } };
    if (req.method !== "GET" && req.method !== "HEAD") init.body = JSON.stringify(req.body || {});
    const r = await handler(new Request(url, init));
    res.status(r.status);
    r.headers.forEach((v, k) => res.set(k, v));
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
};

app.get("/api/health", adapt(health));
app.post("/api/chat", adapt(chat));
app.post("/api/tts", adapt(tts));
app.get("/", (_, res) => res.json({ service: "vartaa-ai-api", ok: true }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Vartaa AI API listening on", port));
