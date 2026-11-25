export type ShortcutId = "undo" | "redo" | "duplicate" | "save" | "export" | "delete" | "addText" | "guides" | "help";
import { readStoredJson, writeStoredValue } from "../lib/safe-storage";

export const DEFAULT_SHORTCUTS: Record<ShortcutId, string[]> = {
  undo: ["Ctrl+Z", "Meta+Z"],
  redo: ["Ctrl+Y", "Meta+Y", "Ctrl+Shift+Z", "Meta+Shift+Z"],
  duplicate: ["Ctrl+D", "Meta+D"],
  save: ["Ctrl+S", "Meta+S"],
  export: ["Ctrl+E", "Meta+E"],
  delete: ["Delete", "Backspace"],
  addText: ["T"],
  guides: ["Shift+G"],
  help: ["Shift+?"],
};

const STORAGE_KEY = "cardcraft:shortcut-bindings";

export function readShortcutBindings(): Partial<Record<ShortcutId, string>> {
  const value = readStoredJson<unknown>(STORAGE_KEY, {});
  return value && typeof value === "object" ? value as Partial<Record<ShortcutId, string>> : {};
}

export function saveShortcutBindings(bindings: Partial<Record<ShortcutId, string>>) {
  writeStoredValue(STORAGE_KEY, JSON.stringify(bindings));
}

export function normalizeShortcutEvent(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">) {
  if (event.key === "Escape") return "Escape";
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!["Control", "Alt", "Shift", "Meta"].includes(event.key)) parts.push(key);
  return parts.join("+");
}

export function matchesShortcut(event: KeyboardEvent, id: ShortcutId) {
  const normalized = normalizeShortcutEvent(event);
  const custom = readShortcutBindings()[id];
  return custom ? normalized === custom : DEFAULT_SHORTCUTS[id].includes(normalized);
}
