import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useEditorStore } from "../model/store";
import { Button, Modal } from "./ui";
import { DEFAULT_SHORTCUTS, normalizeShortcutEvent, readShortcutBindings, saveShortcutBindings, type ShortcutId } from "./shortcuts";

type Shortcut = {
  id: ShortcutId;
  label: string;
};

const SHORTCUTS: Shortcut[] = [
  { id: "undo", label: "Undo" },
  { id: "redo", label: "Redo" },
  { id: "duplicate", label: "Duplicate selection or slide" },
  { id: "save", label: "Save project" },
  { id: "export", label: "Export active slide as PNG" },
  { id: "delete", label: "Delete selected layers" },
  { id: "addText", label: "Add a text layer" },
  { id: "guides", label: "Toggle safe-area guides" },
  { id: "help", label: "Show/hide this shortcuts overlay" },
];

export function ShortcutsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toggleShortcuts = useEditorStore((s) => s.toggleShortcuts);
  const [bindings, setBindings] = useState(() => readShortcutBindings());
  const [recording, setRecording] = useState<ShortcutId | null>(null);

  const capture = (id: ShortcutId, event: KeyboardEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setRecording(null); return; }
    if (["Control", "Meta", "Shift", "Alt"].includes(event.key)) return;
    const shortcut = normalizeShortcutEvent(event.nativeEvent);
    const next = { ...bindings, [id]: shortcut };
    setBindings(next);
    saveShortcutBindings(next);
    setRecording(null);
  };

  const reset = (id: ShortcutId) => {
    const next = { ...bindings };
    delete next[id];
    setBindings(next);
    saveShortcutBindings(next);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) toggleShortcuts();
        else onOpenChange(next);
      }}
      title="Keyboard shortcuts"
    >
      <div className="grid gap-3 text-xs">
        <p className="text-[11px] text-[var(--text-muted)]">Select a shortcut and press the new key combination. Changes are saved in this browser.</p>
        {SHORTCUTS.map((item) => {
          const keys = bindings[item.id] ? [bindings[item.id]!] : DEFAULT_SHORTCUTS[item.id];
          return (
          <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <span className="text-[var(--text-main)]">{item.label}</span>
            <div className="flex flex-wrap justify-end gap-1.5 text-[var(--text-muted)]">
              {keys.map((key) => <kbd key={key} className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-[var(--border-base)] bg-[var(--bg-surface-elevated)] px-1 text-[var(--text-secondary)] shadow-xs">{key}</kbd>)}
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => setRecording(item.id)} onKeyDown={(event) => { if (recording === item.id) capture(item.id, event); }} className="rounded border border-[var(--border-base)] px-2 py-1 text-[10px] text-sky-500 hover:bg-sky-500/10">{recording === item.id ? "Press keys…" : "Change"}</button>
              {bindings[item.id] && <button type="button" onClick={() => reset(item.id)} title="Restore default shortcut" className="rounded px-1.5 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)]">Reset</button>}
            </div>
          </div>
          );
        })}
        <div className="pt-2 flex justify-end">
          <Button variant="ghost" onClick={() => toggleShortcuts()} className="text-[11px]">
            <X className="size-3.5 mr-1" /> Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
