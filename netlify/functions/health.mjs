export const config = { path: "/api/health" };
export default async () => new Response(JSON.stringify({ ok: true, hasKey: !!process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-3.6-flash", time: new Date().toISOString() }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
