/** Optional server-only OpenAI-compatible inference adapter. */
export type SelfHostedTask = "analysis" | "fix";
export function isSelfHostedConfigured(): boolean {
  return Boolean(process.env.SELF_HOSTED_AI_URL && process.env.SELF_HOSTED_AI_MODEL);
}
export async function generateSelfHosted(prompt: string, task: SelfHostedTask): Promise<string> {
  const url = process.env.SELF_HOSTED_AI_URL;
  const model = process.env.SELF_HOSTED_AI_MODEL;
  if (!url || !model) throw new Error("Self-hosted AI not configured");
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" && !(process.env.NODE_ENV === "development" && endpoint.protocol === "http:" && endpoint.hostname === "localhost")) throw new Error("HTTPS required for self-hosted AI");
  if (!endpoint.pathname.endsWith("/chat/completions")) throw new Error("Expected /v1/chat/completions endpoint");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(endpoint, {
      method: "POST", signal: controller.signal, cache: "no-store",
      headers: { "Content-Type": "application/json", ...(process.env.SELF_HOSTED_AI_KEY ? { Authorization: `Bearer ${process.env.SELF_HOSTED_AI_KEY}` } : {}) },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: task === "analysis" ? 4000 : 2000,
        messages: [
          { role: "system", content: task === "analysis" ? "Analyze only CV evidence. Return valid JSON matching the user schema. Never invent qualifications, achievements or metrics." : "Rewrite only the supported CV section. Never invent CV facts. Return only CV-ready text." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Self-hosted model HTTP ${response.status}`);
    const data: unknown = await response.json();
    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("Empty self-hosted response");
    return content.trim();
  } finally { clearTimeout(timeout); }
}
