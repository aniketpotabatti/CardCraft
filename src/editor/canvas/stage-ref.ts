import type Konva from "konva";

const listeners = new Set<() => void>();
let stage: Konva.Stage | null = null;

export function setStudioStage(next: Konva.Stage | null) {
  if (stage === next) return;
  stage = next;
  listeners.forEach(listener => listener());
}

export function getStudioStage() {
  return stage;
}

export function subscribeStudioStage(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
