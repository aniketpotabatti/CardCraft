import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "../../app/ui";
import { useEditorStore } from "../../model/store";

export function Filmstrip() {
  const slides = useEditorStore((s) => s.project.slides);
  const selected = useEditorStore((s) => s.selectedSlideId);
  const selectSlide = useEditorStore((s) => s.selectSlide);
  const addSlide = useEditorStore((s) => s.addSlide);
  const duplicateActiveSlide = useEditorStore((s) => s.duplicateActiveSlide);
  const deleteSlide = useEditorStore((s) => s.deleteSlide);
  const reorderSlides = useEditorStore((s) => s.reorderSlides);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = slides.findIndex((slide) => slide.id === active.id);
    const to = slides.findIndex((slide) => slide.id === over.id);
    if (from < 0 || to < 0) return;
    reorderSlides(from, to);
  };

  return (
    <div className="flex items-center gap-3 border-t border-[var(--border-base)] bg-[var(--bg-surface)] px-4 py-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slides.map((slide) => slide.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {slides.map((slide, index) => (
              <SortableThumb
                key={slide.id}
                id={slide.id}
                index={index}
                total={slides.length}
                active={slide.id === selected}
                onSelect={() => selectSlide(slide.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex shrink-0 gap-1.5">
        <Button onClick={addSlide} className="font-medium">
          <Plus className="size-3.5" />
          Slide
        </Button>
        <Button onClick={duplicateActiveSlide} title="Duplicate active slide">
          <Copy className="size-3.5" />
        </Button>
        <Button variant="danger" onClick={() => deleteSlide(selected)} disabled={slides.length === 1} title="Delete active slide">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function SortableThumb({
  id,
  index,
  total,
  active,
  onSelect,
}: {
  id: string;
  index: number;
  total: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex h-16 w-12 shrink-0 flex-col items-center justify-end rounded-md border text-[10px] transition ${
        active
          ? "border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300 ring-2 ring-sky-500 font-semibold"
          : "border-[var(--border-base)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:border-sky-500/40"
      }`}
    >
      <span className="mb-1 font-mono">{index + 1} / {total}</span>
    </button>
  );
}
