# Vartaa AI — Vernacular AI Sales Rep for coaching businesses

**Prototype submission — BITSoM Vertex Builders' Pitch Fest 2026 · Sales Automation AI Agents**

Vartaa AI is an AI sales representative for India's coaching institutes, trainers and course creators. It talks to every lead on WhatsApp and voice calls in **Hindi, Marathi, Hinglish or English**, answers doubts from the coach's knowledge base, handles objections with the coach's own playbook, calls tools (book workshop, schedule callback, escalate to human…) and builds the CRM automatically.

## What's in this repo
| Path | What |
|---|---|
| `public/index.html` | The product UI — dashboard, conversations (WhatsApp-style simulator), voice calls, leads CRM, knowledge base, objection playbook, integrations |
| `netlify/functions/chat.mjs` | The agent brain — `POST /api/chat`. Google Gemini with structured JSON output: reply + language/script + intent + objection + strategy + guardrails + lead-profile update + tool calls. Also a `lead_sim` mode where Gemini role-plays a realistic lead for stress-testing. |
| `netlify/functions/health.mjs` | `GET /api/health` |
| `netlify/functions/tts.mjs` | `POST /api/tts` — neural Indic TTS (Sarvam Bulbul → Gemini TTS) |
| `server/index.mjs` + `Dockerfile` | The same handlers served by Express on **Google Cloud Run** |
| `firebase.json`, `firestore.rules` | **Firebase Hosting** (rewrites `/api/**` → Cloud Run) and Firestore security rules |

Everything the agent says, classifies and does is generated live. Each workspace (knowledge base, leads, conversations) is stored in Firestore under an anonymous Firebase Auth user, with localStorage as fallback.

## Deploy on Google Cloud (Cloud Run + Firebase) — primary
Architecture: **Firebase Hosting** serves the app; Hosting rewrites `/api/**` to the **Cloud Run** service `vartaa-api` (Express, `server/index.mjs`, containerised by `Dockerfile`); the app signs in with **Firebase anonymous Auth** and stores each workspace (knowledge base, leads, conversations) in **Firestore** (`firestore.rules`).

Prereqs: `gcloud` CLI, Node 18+, a Firebase project on the Blaze plan (needed for Hosting→Cloud Run rewrites), Firebase Auth → Sign-in method → **Anonymous** enabled.
```
bash deploy-gcp.sh <gcp-project-id>
```
The script enables APIs, creates Firestore (asia-south1), deploys the API to Cloud Run with `GEMINI_API_KEY` (+ optional `SARVAM_API_KEY`), then deploys Hosting + Firestore rules. App: `https://<project-id>.web.app` · API health: `https://<project-id>.web.app/api/health`.

## Deploy (Netlify) — alternative
1. Import this repo in Netlify (build command: none, publish dir: `public`, functions: `netlify/functions` — all set in `netlify.toml`).
2. Site configuration → Environment variables → add `GEMINI_API_KEY` (optional: `GEMINI_MODEL`, default `gemini-3.6-flash`; `SARVAM_API_KEY` for the best Hindi/Marathi voice via Sarvam Bulbul — otherwise Gemini TTS is used; `GEMINI_VOICE` default `Kore`).
3. Deploy. Open the site → Conversations → **+ New** → talk to the agent.

## Local
```
npm i -g netlify-cli
GEMINI_API_KEY=... netlify dev
```

## Roadmap
v0.3 WhatsApp Cloud API + Exotel voice (Sarvam STT/TTS) + Meta Lead Ads webhook · v0.4 Razorpay, Google Sheets/Zoho sync, multi-tenant accounts · Gujarati, Tamil, Telugu.

Built by Ajit Ovhal · AI Freedom Institute, Pune · https://aifreedom.in
