import { pageName } from "../../model/names";
import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { Clock3, GitCompareArrows, RotateCcw, Trash2 } from "lucide-react";
import { Button, Input, Modal } from "../../app/ui";
import { captureProjectAssets, deleteSnapshot, loadSnapshots, saveProject, saveSnapshot, type NamedSnapshot } from "../../lib/idb";
import { useEditorStore } from "../../model/store";
import type { Project } from "../../model/types";
import { SlidePreview } from "./SlidePreview";

export function HistoryPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const project = useEditorStore((state) => state.project);
  const replaceProject = useEditorStore((state) => state.replaceProject);
  const registerAsset = useEditorStore((state) => state.registerAsset);
  const [name, setName] = useState("");
  const [snapshots, setSnapshots] = useState<NamedSnapshot[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [comparison, setComparison] = useState<NamedSnapshot | null>(null);

  const refresh = useCallback(() => { void loadSnapshots().then((all) => { setSnapshots(all); setError(""); }).catch((cause) => { console.error("Could not load project history", cause); setError("Version history could not be loaded from this browser."); }); }, []);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveSnapshot({ id: nanoid(), name: trimmed, createdAt: Date.now(), project: structuredClone(project), assets: await captureProjectAssets(project) });
      setName("");
      refresh();
    } catch (cause) {
      console.error("Could not save project snapshot", cause);
      setError(cause instanceof Error ? cause.message : "This snapshot could not be saved. Check available browser storage and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Named version history">
      <p className="mb-4 text-xs text-[var(--text-muted)]">Save a named restore point for this project. Snapshots stay in this browser.</p>
      <div className="mb-4 flex gap-2">
        <Input value={name} maxLength={80} placeholder="e.g. Before layout change" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} />
        <Button variant="accent" disabled={!name.trim() || saving} onClick={() => void create()}>{saving ? "Saving…" : "Save snapshot"}</Button>
      </div>
      {error && <p role="alert" className="mb-3 rounded-md bg-rose-500/10 p-2 text-xs text-rose-300">{error}</p>}
      <div className="grid gap-2">
      {snapshots.length === 0 ? <p className="rounded-lg border border-[var(--border-base)] p-4 text-center text-xs text-[var(--text-muted)]">No named snapshots yet.</p> : snapshots.map((snapshot) => (
          <div key={snapshot.id} className="flex items-center gap-2 rounded-lg border border-[var(--border-base)] p-3">
            <Clock3 className="size-4 shrink-0 text-sky-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-[var(--text-main)]">{snapshot.name}</div>
              <div className="truncate text-[10px] text-[var(--text-muted)]">{snapshot.project.name} · {new Date(snapshot.createdAt).toLocaleString()} · {snapshot.project.slides.length} slides</div>
            </div>
            <Button title="Compare with current project" onClick={() => setComparison(snapshot)}><GitCompareArrows className="size-3.5" /> Compare</Button>
            <Button title="Restore snapshot" onClick={() => {
              if (window.confirm(`Restore “${snapshot.name}”? Current unsaved changes will be replaced.`)) {
                void (async () => {
                  setError("");
                  try {
                    await saveProject(snapshot.project, project, snapshot.assets);
                    for (const [id, blob] of Object.entries(snapshot.assets ?? {})) {
                      registerAsset(id, { url: URL.createObjectURL(blob) });
                    }
                    replaceProject(structuredClone(snapshot.project));
                    onOpenChange(false);
                  } catch (cause) {
                    console.error("Could not restore project snapshot", cause);
                    setError("This version could not be restored. Your current project is still open.");
                  }
                })();
              }
            }}><RotateCcw className="size-3.5" /> Restore</Button>
            <Button title="Delete snapshot" variant="danger" onClick={() => { void deleteSnapshot(snapshot.id).then(refresh); }}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
      </div>
      <Modal open={!!comparison} onOpenChange={(open) => { if (!open) setComparison(null); }} title="Compare versions">
        {comparison && <ProjectComparison older={comparison} current={project} />}
      </Modal>
    </Modal>
  );
}

function ProjectComparison({ older, current }: { older: NamedSnapshot; current: Project }) {
  const [selectedSlideId, setSelectedSlideId] = useState(older.project.slides[0]?.id ?? "");
  const previousSlides = new Map(older.project.slides.map((slide) => [slide.id, slide]));
  const currentSlides = new Map(current.slides.map((slide) => [slide.id, slide]));
  const added = current.slides.filter((slide) => !previousSlides.has(slide.id));
  const removed = older.project.slides.filter((slide) => !currentSlides.has(slide.id));
  const changed = older.project.slides.filter((slide) => {
    const next = currentSlides.get(slide.id);
    return next && JSON.stringify(slide) !== JSON.stringify(next);
  });
  const slideChanges = [
    ...added.map((slide) => `Added slide: ${slideName(slide, current.slides.indexOf(slide))}`),
    ...removed.map((slide) => `Removed slide: ${slideName(slide, older.project.slides.indexOf(slide))}`),
    ...changed.map((slide) => `Edited slide: ${slideName(slide, current.slides.findIndex((item) => item.id === slide.id))}`),
  ];
  const olderLayers = older.project.slides.reduce((total, slide) => total + slide.layers.length, 0);
  const currentLayers = current.slides.reduce((total, slide) => total + slide.layers.length, 0);
  const brandChanged = JSON.stringify(older.project.brand) !== JSON.stringify(current.brand);
  const summary = slideChanges.length || brandChanged || older.project.name !== current.name
    ? [...slideChanges, ...(brandChanged ? ["Brand kit changed"] : []), ...(older.project.name !== current.name ? ["Project name changed"] : [])]
    : [];
  const selectedOlder = older.project.slides.find((slide) => slide.id === selectedSlideId) ?? older.project.slides[0];
  const selectedCurrent = current.slides.find((slide) => slide.id === selectedSlideId) ?? current.slides[0];

  return <div className="grid max-w-3xl gap-4">
    <p className="text-xs text-[var(--text-muted)]">Compare slide layouts side by side. Structural changes are listed below.</p>
    {older.project.slides.length > 0 && <div className="grid gap-2 rounded-lg border border-[var(--border-base)] p-3">
      <label className="text-[10px] font-medium text-[var(--text-secondary)]">Compare page<select value={selectedSlideId} onChange={(event) => setSelectedSlideId(event.target.value)} className="ml-2 h-8 rounded border border-[var(--border-strong)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-main)]">{older.project.slides.map((slide, index) => <option key={slide.id} value={slide.id}>Page {index + 1} · {slideName(slide, index)}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid content-start gap-1.5"><span className="text-[10px] font-semibold text-[var(--text-secondary)]">Snapshot</span>{selectedOlder && <SlidePreview slide={selectedOlder} className="w-full overflow-hidden rounded-md border border-[var(--border-base)]" style={{ aspectRatio: `${selectedOlder.width} / ${selectedOlder.height}` }} />}</div>
        <div className="grid content-start gap-1.5"><span className="text-[10px] font-semibold text-[var(--text-secondary)]">Current version</span>{selectedCurrent ? <SlidePreview slide={selectedCurrent} className="w-full overflow-hidden rounded-md border border-[var(--border-base)]" style={{ aspectRatio: `${selectedCurrent.width} / ${selectedCurrent.height}` }} /> : <div className="grid aspect-[4/5] place-items-center rounded-md border border-dashed border-[var(--border-strong)] text-[10px] text-[var(--text-muted)]">Page removed</div>}</div>
      </div>
    </div>}
    <div className="grid grid-cols-2 gap-3">
      <ComparisonColumn label={older.name} project={older.project} createdAt={older.createdAt} layerCount={olderLayers} />
      <ComparisonColumn label="Current project" project={current} createdAt={current.updatedAt} layerCount={currentLayers} />
    </div>
    <section className="rounded-lg border border-[var(--border-base)] p-3">
      <h3 className="mb-2 text-xs font-semibold text-[var(--text-main)]">Changes since snapshot</h3>
      {summary.length === 0 ? <p className="text-xs text-[var(--text-muted)]">No document changes detected.</p> : <ul className="grid gap-1.5 text-xs text-[var(--text-secondary)]">
        {summary.slice(0, 12).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
        {summary.length > 12 && <li className="text-[var(--text-muted)]">and {summary.length - 12} more changes</li>}
      </ul>}
    </section>
  </div>;
}

function ComparisonColumn({ label, project, createdAt, layerCount }: { label: string; project: Project; createdAt: number; layerCount: number }) {
  return <div className="grid gap-1 rounded-lg border border-[var(--border-base)] p-3">
    <h3 className="truncate text-xs font-semibold text-[var(--text-main)]">{label}</h3>
    <p className="truncate text-[10px] text-[var(--text-muted)]">{project.name} · {new Date(createdAt).toLocaleString()}</p>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">{project.slides.length} slides · {layerCount} layers</p>
  </div>;
}

function slideName(slide: Project["slides"][number], index: number) {
  return pageName(slide, index);
}
