import { Check, MessageSquarePlus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../app/ui";
import { useEditorStore } from "../../model/store";

export function CommentsPanel() {
  const project = useEditorStore((state) => state.project);
  const activeSlideId = useEditorStore((state) => state.selectedSlideId);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const selectSlide = useEditorStore((state) => state.selectSlide);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const addComment = useEditorStore((state) => state.addComment);
  const updateComment = useEditorStore((state) => state.updateComment);
  const deleteComment = useEditorStore((state) => state.deleteComment);
  const [body, setBody] = useState("");
  const activeSlide = project.slides.find((slide) => slide.id === activeSlideId);
  const comments = [...(project.comments ?? [])].sort((a, b) => b.createdAt - a.createdAt);

  const commentOnSelection = () => {
    const text = body.trim();
    if (!text) return;
    addComment(text, selectedLayerIds.length === 1 ? selectedLayerIds[0] : undefined);
    setBody("");
  };

  return <div className="flex h-full flex-col overflow-hidden">
    <div className="border-b border-[var(--border-base)] px-3 py-3">
      <h3 className="text-xs font-semibold text-[var(--text-main)]">Comments</h3>
      <p className="mt-1 text-[10px] text-[var(--text-muted)]">Pin feedback to the selected layer or this page.</p>
    </div>
    <div className="grid gap-2 border-b border-[var(--border-base)] p-3">
      <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Leave a note for this design…" rows={3} className="resize-y rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] p-2.5 text-[11px] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-sky-500" aria-label="New comment" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[9px] text-[var(--text-muted)]">{selectedLayerIds.length === 1 ? "Attached to selected layer" : `Page · ${activeSlide ? project.slides.findIndex((slide) => slide.id === activeSlide.id) + 1 : "—"}`}</span>
        <Button className="h-7 shrink-0 px-2.5" disabled={!body.trim()} onClick={commentOnSelection}><MessageSquarePlus className="size-3.5" /> Add comment</Button>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
      {comments.length ? <div className="grid gap-2">{comments.map((comment) => {
        const slide = project.slides.find((item) => item.id === comment.slideId);
        const slideIndex = project.slides.findIndex((item) => item.id === comment.slideId);
        const layer = slide?.layers.find((item) => item.id === comment.layerId);
        const layerName = layer?.type === "text" ? layer.text.trim().split("\n")[0] || "Text layer" : layer?.type === "image" ? "Image layer" : layer?.type === "shape" ? layer.shape : undefined;
        return <article key={comment.id} className={`rounded-lg border p-2.5 ${comment.resolved ? "border-[var(--border-base)] opacity-60" : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]/35"}`}>
          <button type="button" onClick={() => { if (!slide) return; selectSlide(slide.id); if (layer) selectLayer(layer.id); }} className="mb-1.5 block max-w-full truncate text-[9px] font-medium text-sky-400 hover:underline">Page {slideIndex + 1}{layerName ? ` · ${layerName}` : " · Page note"}</button>
          <p className={`whitespace-pre-wrap break-words text-[11px] leading-relaxed ${comment.resolved ? "line-through text-[var(--text-muted)]" : "text-[var(--text-main)]"}`}>{comment.body}</p>
          <div className="mt-2 flex items-center justify-between"><time className="text-[9px] text-[var(--text-muted)]">{new Date(comment.createdAt).toLocaleString()}</time><div className="flex gap-1">
            <button type="button" onClick={() => updateComment(comment.id, { resolved: !comment.resolved })} title={comment.resolved ? "Reopen comment" : "Resolve comment"} aria-label={comment.resolved ? "Reopen comment" : "Resolve comment"} className="grid size-6 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]">{comment.resolved ? <RotateCcw className="size-3" /> : <Check className="size-3" />}</button>
            <button type="button" onClick={() => deleteComment(comment.id)} title="Delete comment" aria-label="Delete comment" className="grid size-6 place-items-center rounded text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="size-3" /></button>
          </div></div>
        </article>;
      })}</div> : <div className="grid h-full place-content-center px-5 text-center"><MessageSquarePlus className="mx-auto mb-2 size-5 text-[var(--text-muted)]" /><p className="text-[11px] font-medium text-[var(--text-secondary)]">No comments yet</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Select a layer and leave feedback to keep review notes connected to the design.</p></div>}
    </div>
  </div>;
}
