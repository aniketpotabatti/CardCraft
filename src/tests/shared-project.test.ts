import { expect, it } from "vitest";
import * as Y from "yjs";
import { readSharedProject, writeSharedProject } from "../collab/shared-project";
import { createProject } from "../model/document";

it("merges independent comment pins from peers and propagates resolution", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  try {
    const project = createProject();
    const first = a.getMap("project");
    const second = b.getMap("project");
    writeSharedProject(first, project);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    for (const [root, id] of [[first, "first"], [second, "second"]] as const) {
      writeSharedProject(root, { ...project, comments: [{ id, body: id, slideId: project.slides[0].id, x: 10, y: 20, createdAt: 1 }] });
    }
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const merged = readSharedProject(first)!;
    expect(merged.comments?.map(pin => pin.id).sort()).toEqual(["first", "second"]);
    writeSharedProject(first, { ...merged, comments: merged.comments?.map(pin => ({ ...pin, resolved: true })) });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(readSharedProject(second)?.comments?.filter(pin => pin.resolved)).toHaveLength(2);
  } finally {
    a.destroy();
    b.destroy();
  }
});
