import { useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ArrowUpRight, Check, ChevronDown, Circle, Command, Hash, Image as ImageIcon, MessageSquare, Minus, MousePointer2, Paintbrush, Pencil, PenTool, Square, Star, Triangle, Type, X } from "lucide-react";
import { isInk, primitives, type Primitive } from "../model/drawing";
import type { FigmaTool } from "../model/types";
import type { StrokeStyle } from "../editor/canvas/DrawingSurface";

const inkTools = [{ id: "pen", label: "Pen (P)", Icon: PenTool }, { id: "brush", label: "Brush (B)", Icon: Paintbrush }, { id: "pencil", label: "Pencil (Shift+P)", Icon: Pencil }] as const;

interface FigmaToolbarProps {
  activeTool: FigmaTool;
  onSelectTool: (tool: FigmaTool) => void;
  onAddText: () => void;
  stroke: StrokeStyle;
  onStroke: (stroke: StrokeStyle) => void;
  onAddImage: () => void;
  onToggleComments: () => void;
  onOpenCommands: () => void;
  commentsActive?: boolean;
  disabled?: boolean;
}

export function FigmaToolbar({
  activeTool,
  onSelectTool,
  onAddText,
  stroke, onStroke,
  onAddImage,
  onToggleComments,
  onOpenCommands,
  commentsActive = false,
  disabled = false,
}: FigmaToolbarProps) {
  const [lastInk, setLastInk] = useState<(typeof inkTools)[number]["id"]>("pen");
  const currentInk = inkTools.find(tool => tool.id === (isInk(activeTool) ? activeTool : lastInk))!;
  const selectInk = (id: typeof lastInk) => { setLastInk(id); onSelectTool(id); };
  const [lastShape, setLastShape] = useState<Primitive>("rect");
  const shapeTools = {
    rect: { label: "Rectangle", shortcut: "R", icon: Square }, line: { label: "Line", shortcut: "L", icon: Minus },
    arrow: { label: "Arrow", shortcut: "Shift+L", icon: ArrowUpRight }, ellipse: { label: "Ellipse", shortcut: "O", icon: Circle },
    polygon: { label: "Polygon", shortcut: "", icon: Triangle }, star: { label: "Star", shortcut: "", icon: Star },
  };
  const current = primitives.find(tool => tool === activeTool) ?? lastShape;
  const ShapeIcon = shapeTools[current].icon;
  const isToolActive = (tool: FigmaTool) => activeTool === tool;
  const baseButton = "flex h-8 items-center justify-center rounded-lg text-xs transition-colors disabled:opacity-[var(--disabled-opacity)] disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]";
  const activeButton = "bg-[var(--border-focus)] text-white shadow-xs";
  const inactiveButton = "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]";

  return (
    <div

      className="relative z-30 flex items-center gap-0.5 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)]/95 px-2 py-1.5 shadow-[var(--shadow-panel)] backdrop-blur-xl"
    >
      {/* 1. Move Tool (Single, clean tool button without hand/scale) */}
      <button
        type="button"
        onClick={() => {
          onSelectTool("move");

        }}
        title="Move (V)"
        disabled={disabled}
        aria-pressed={isToolActive("move")}
        className={`${baseButton} px-2 ${isToolActive("move") ? activeButton : inactiveButton}`}
      >
        <MousePointer2 className="size-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-[var(--border-base)]" />

      {/* 2. Frame Tool */}
      <button
        type="button"
        onClick={() => {
          onSelectTool("frame");

        }}
        title="Frame (F / A)"
        disabled={disabled}
        aria-pressed={isToolActive("frame")}
        className={`${baseButton} size-8 place-items-center ${isToolActive("frame") ? activeButton : inactiveButton}`}
      >
        <Hash className="size-4" />
      </button>

      <button type="button" title={shapeTools[current].label} aria-pressed={activeTool === current} className={baseButton + " px-2 " + (activeTool === current ? activeButton : inactiveButton)} onClick={() => onSelectTool(current)}><ShapeIcon className="size-4" /></button>
      <Dropdown.Root><Dropdown.Trigger asChild><button title="Shape tools menu" aria-label="Shape tools menu" className={baseButton + " w-4 " + inactiveButton}><ChevronDown size={12} /></button></Dropdown.Trigger>
        <Dropdown.Portal><Dropdown.Content side="top" sideOffset={10} align="start" aria-label="Shape tools" className="z-50 min-w-52 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] p-1.5 text-xs text-[var(--text-main)] shadow-xl">
          {primitives.map(tool => { const { label, shortcut, icon: Icon } = shapeTools[tool]; return <Dropdown.Item key={tool} onSelect={() => { setLastShape(tool); onSelectTool(tool); }} className="flex h-7 cursor-default items-center gap-2 rounded px-2 outline-none data-[highlighted]:bg-sky-600 data-[highlighted]:text-white">
            <Check size={13} className={tool === current ? "" : "invisible"} /><Icon size={15} />{label}<span className="ml-auto opacity-65">{shortcut}</span>
          </Dropdown.Item>; })}
          <Dropdown.Item onSelect={onAddImage} className="flex h-7 items-center gap-2 rounded px-2 pl-7 outline-none data-[highlighted]:bg-sky-600 data-[highlighted]:text-white"><ImageIcon size={15} />Image/video…<span className="ml-auto opacity-65">Ctrl+Shift+K</span></Dropdown.Item>
        </Dropdown.Content></Dropdown.Portal>
      </Dropdown.Root>
      {/* 4. Text Tool */}
      <button
        type="button"
        onClick={() => {
          onAddText();
          onSelectTool("text");
        }}
        title="Text (T)"
        disabled={disabled}
        aria-pressed={isToolActive("text")}
        className={`${baseButton} size-8 place-items-center ${isToolActive("text") ? activeButton : inactiveButton}`}
      >
        <Type className="size-4" />
      </button>

      <div className="hidden lg:flex">{inkTools.map(({ id, label, Icon }) =>
        <button key={id} title={label} aria-label={label} aria-pressed={activeTool === id} onClick={() => selectInk(id)} className={baseButton + " size-8 " + (activeTool === id ? activeButton : inactiveButton)}><Icon size={16} /></button>)}</div>
      <div className="flex lg:hidden">
        <button title={currentInk.label} aria-pressed={isInk(activeTool)} onClick={() => selectInk(currentInk.id)} className={baseButton + " size-8 " + (isInk(activeTool) ? activeButton : inactiveButton)}><currentInk.Icon size={16} /></button>
        <Dropdown.Root><Dropdown.Trigger asChild><button aria-label="Drawing tools menu" className={baseButton + " w-4"}><ChevronDown size={12} /></button></Dropdown.Trigger>
          <Dropdown.Portal><Dropdown.Content side="top" sideOffset={8} className="z-50 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] p-1 shadow-lg">
            {inkTools.map(({ id, label, Icon }) => <Dropdown.Item key={id} onSelect={() => selectInk(id)} className="flex items-center gap-2 rounded px-3 py-2 text-xs outline-none data-[highlighted]:bg-sky-600 data-[highlighted]:text-white"><Icon size={14} />{label}</Dropdown.Item>)}
          </Dropdown.Content></Dropdown.Portal>
        </Dropdown.Root>
      </div>
      {isInk(activeTool) && <div role="group" aria-label="Drawing stroke" className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] p-2 shadow-lg">
        <input type="color" aria-label="Drawing color" value={stroke.color} onChange={e => onStroke({ ...stroke, color: e.target.value })} className="size-6" />
        <input type="number" aria-label="Stroke weight" min={1} max={200} value={stroke.weight} onChange={e => onStroke({ ...stroke, weight: Math.max(1, Math.min(200, Number(e.target.value))) })} className="w-11 bg-transparent text-xs" />
        <input type="range" aria-label="Adjust stroke weight" min={1} max={200} value={stroke.weight} onChange={e => onStroke({ ...stroke, weight: Number(e.target.value) })} className="w-20" />
        <svg width="46" height="22" aria-label="Stroke preview"><path d={activeTool === "brush" ? "M3 15 Q16 2 27 9 T43 10" : "M3 11 H43"} stroke={stroke.color} strokeWidth={Math.min(19, stroke.weight)} fill="none" strokeLinecap="round" /></svg>
        <button aria-label="Exit drawing" onClick={() => onSelectTool("move")}><X size={14} /></button>
      </div>}
      <div className="mx-1 h-5 w-px bg-[var(--border-base)]" />

      {/* 7. Comments Toggle */}
      <button
        type="button"
        onClick={onToggleComments}
        title="Comments (C)"
        disabled={disabled}
        aria-pressed={commentsActive}
        className={`${baseButton} size-8 place-items-center ${commentsActive ? activeButton : inactiveButton}`}
      >
        <MessageSquare className="size-4" />
      </button>

      {/* 8. Dev Mode Toggle (</>) */}
      <button
        type="button"
        onClick={onOpenCommands}
        title="Command palette (Ctrl/⌘+K)"
        disabled={disabled}
        className={`${baseButton} size-8 place-items-center ${inactiveButton}`}
      >
        <Command className="size-4" />
      </button>
    </div>
  );
}
