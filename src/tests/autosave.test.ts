import { expect, it, vi } from "vitest";
import { setMany } from "idb-keyval";
import { useEditorStore } from "../model/store";

vi.mock("idb-keyval", async (load) => ({
  ...await load<typeof import("idb-keyval")>(),
  setMany: vi.fn().mockResolvedValue(undefined),
}));

it("writes the pending edit and the newly active project together on switch", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  const initial = useEditorStore.getState();
  try {
    useEditorStore.setState({ hydrated: true });
    initial.setProjectName("Last edit before switch");
    const outgoing = useEditorStore.getState().project;
    initial.replaceProject({ ...outgoing, id: "second-project", name: "Second project" });
    const incoming = useEditorStore.getState().project;
    await vi.advanceTimersByTimeAsync(401);
    expect(setMany).toHaveBeenCalledTimes(1);
    expect(setMany).toHaveBeenCalledWith(expect.arrayContaining([
      ["card-studio:project:" + outgoing.id, outgoing],
      ["card-studio:project:" + incoming.id, incoming],
      ["card-studio:current-project", incoming.id],
    ]));
  } finally {
    useEditorStore.setState(initial);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
