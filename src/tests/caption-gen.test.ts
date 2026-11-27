import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateCaptionOptions, GeminiKeyError } from "../ai/captionGen";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("honors Retry-After and recovers from a Gemini 503 with the original request", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 503, headers: { "Retry-After": "2" } }));
  fetchMock.mockResolvedValueOnce(Response.json({
    steps: [{ type: "model_output", content: [{ type: "text", text: "1. Fresh caption" }] }],
  }));

  const result = generateCaptionOptions("test-key", "Make it shorter", { original: "Original caption" });
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toEqual(["Fresh caption"]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
});

it("stops after two retries when Gemini stays unavailable", async () => {
  fetchMock.mockImplementation(async () => new Response(null, { status: 503 }));
  const result = expect(generateCaptionOptions("test-key", "Draft a caption"))
    .rejects.toThrow("Gemini is temporarily unavailable");
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await result;
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("cancels a retry when the Assistant aborts the request", async () => {
  const controller = new AbortController();
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
  const result = expect(generateCaptionOptions("test-key", "Draft a caption", { signal: controller.signal }))
    .rejects.toHaveProperty("name", "AbortError");
  await vi.advanceTimersByTimeAsync(500);
  controller.abort();
  await result;
  await vi.runAllTimersAsync();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("returns a key error immediately for a rejected key", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(generateCaptionOptions("test-key", "Draft a caption")).rejects.toBeInstanceOf(GeminiKeyError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
