import type { PointerEvent as ReactPointerEvent } from "react";
import type { Project } from "./types";

let active: AbortController | undefined;
let lastProject: Project | undefined;
let applying = false;

export function beginSliderDrag(event: ReactPointerEvent) {
  if (!event.isPrimary || event.button !== 0) return;
  active?.abort();
  active = new AbortController();
  lastProject = undefined;
  const finish = () => {
    active?.abort();
    active = undefined;
    lastProject = undefined;
  };
  const release = (end: PointerEvent) => {
    if (end.pointerId === event.pointerId) finish();
  };
  const options = { signal: active.signal, capture: true };
  window.addEventListener("pointerup", release, options);
  window.addEventListener("pointercancel", release, options);
  window.addEventListener("blur", finish, options);
}

export function applySliderChange(change: () => void) {
  applying = true;
  try {
    change();
  } finally {
    applying = false;
  }
}

// Retain the first snapshot of consecutive updates from this pointer gesture.
// A document edit from another source always starts a separate history entry.
export function continuesSliderDrag(before: Project, after: Project) {
  const consecutive = Boolean(active && applying && before === lastProject);
  lastProject = active && applying ? after : undefined;
  return consecutive;
}
