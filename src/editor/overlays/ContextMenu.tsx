import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Image, ImageOff, MoveDown, MoveUp, Trash2 } from "lucide-react";

export interface CanvasMenuAction {
  label: string;
  icon: "copy" | "front" | "back" | "delete" | "image" | "remove-background";
  onSelect: () => void;
  danger?: boolean;
}

export function ContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: CanvasMenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const icons = { copy: Copy, front: MoveUp, back: MoveDown, delete: Trash2, image: Image, "remove-background": ImageOff };
  return createPortal((
    <div
      ref={ref}
      role="menu"
      className="fixed z-[100] min-w-44 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] p-1 text-[var(--text-main)] shadow-2xl"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {actions.map((action) => {
        const Icon = icons[action.icon];
        return (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-surface-elevated)] ${action.danger ? "text-rose-500" : "text-[var(--text-secondary)]"}`}
            onClick={() => { action.onSelect(); onClose(); }}
          >
            <Icon className="size-3.5" />{action.label}
          </button>
        );
      })}
    </div>
  ), document.body);
}
