import { readStoredValue, writeStoredValue } from "../lib/safe-storage";

const keyPreference = "cardcraft:gemini-api-key";
let sessionKey: string | undefined;

export const readGeminiKey = () => sessionKey ?? readStoredValue(keyPreference) ?? "";
export function saveGeminiKey(key: string) {
  sessionKey = key;
  writeStoredValue(keyPreference, key);
}

export class GeminiKeyError extends Error {}

async function requestCaptions(request: RequestInit): Promise<Response> {
  const { signal } = request;
  for (let retries = 0; ; retries++) {
    signal?.throwIfAborted();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", request);
    if (response.status !== 503 || retries === 2) return response;

    const retryAfter = response.headers.get("Retry-After")?.trim();
    const retryAfterMs = retryAfter
      ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now())
      : 0;
    const backoff = 1000 * (2 ** retries) + Math.random() * 250;
    const delay = Math.max(backoff, retryAfterMs || 0);
    if (delay > 10_000) return response;

    await response.body?.cancel().catch(() => undefined);
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, delay);
      function abort() {
        clearTimeout(timer);
        reject(signal?.reason);
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
}

export async function generateCaptionOptions(apiKey: string, idea: string, options: {
  original?: string;
  signal?: AbortSignal;
} = {}): Promise<string[]> {
  const redact = (value: string) => apiKey ? value.replaceAll(apiKey, "[API key removed]") : value;
  const response = await requestCaptions({
    method: "POST",
    signal: options.signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model: "gemini-3.8-flash",
      store: false,
      input: [
        "Write exactly three distinct, concise captions for a social card. Return only one caption per line, numbered 1 through 3.",
        options.original !== undefined ? "Existing caption to rewrite: " + JSON.stringify(redact(options.original)) : "",
        "Design brief: " + JSON.stringify(redact(idea)),
      ].filter(Boolean).join("\n"),
    }),
  });
  if (response.status === 503) {
    throw new Error("Gemini is temporarily unavailable. Your draft is saved here. Try sending it again in a few minutes.");
  }
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string; details?: Array<{ reason?: string }> };
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  } | null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 ||
        payload?.error?.details?.some(detail => detail.reason === "API_KEY_INVALID") ||
        /api key.*invalid|api key not valid|api key.*expired/i.test(payload?.error?.message ?? "")) {
      throw new GeminiKeyError("Gemini rejected this API key.");
    }
    throw new Error(response.status === 429 ? "Gemini reached its request limit. Try again shortly." : `Gemini request failed (${response.status}).`);
  }
  const text = payload?.steps?.filter(step => step.type === "model_output")
    .flatMap(step => step.content ?? []).filter(part => part.type === "text")
    .map(part => part.text ?? "").join("\n") ?? "";
  const captions = text.split("\n")
    .map(line => redact(line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "").trim()))
    .filter(Boolean)
    .slice(0, 3);
  if (!captions.length) throw new Error("Gemini returned no caption options. Try a more specific brief.");
  return captions;
}
