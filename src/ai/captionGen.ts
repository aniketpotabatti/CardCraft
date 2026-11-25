export async function generateCaptionOptions(apiKey: string, idea: string): Promise<string[]> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model: "gemini-3.8-flash",
      input: `Write exactly three short, distinct social-card headlines for this idea: ${idea}. Return only a numbered list, one headline per line, no extra commentary.`,
    }),
  });
  const payload = await response.json() as {
    error?: { message?: string };
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  if (!response.ok) throw new Error(payload.error?.message ?? `Gemini request failed (${response.status})`);
  const text = payload.steps?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? []).filter((part) => part.type === "text")
    .map((part) => part.text ?? "").join("\n") ?? "";
  const options = text.split("\n")
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!options.length) throw new Error("Gemini returned no caption options. Try a more specific idea.");
  return options;
}
