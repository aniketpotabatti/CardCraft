import { useMemo, useState } from "react";
import { ArrowRight, Command, Search } from "lucide-react";
import { Input } from "./ui";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  run: () => void;
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: PaletteCommand[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = useMemo(() => commands.filter((command) => `${command.label} ${command.group}`.toLowerCase().includes(query.trim().toLowerCase())), [commands, query]);

  if (!open) return null;
  const close = () => { setQuery(""); setActive(0); onClose(); };
  const run = (index: number) => {
    const command = filtered[index];
    if (!command) return;
    close();
    command.run();
  };

  return <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-[var(--border-base)] px-4">
        <Search className="size-4 shrink-0 text-[var(--text-muted)]" />
        <Input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(filtered.length - 1, index + 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
          if (event.key === "Enter") { event.preventDefault(); run(active); }
        }} placeholder="Search actions and tools…" aria-label="Search commands" className="h-12 border-0 bg-transparent focus-visible:ring-0" />
        <kbd className="rounded border border-[var(--border-base)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">ESC</kbd>
      </div>
      <div className="max-h-[55vh] overflow-y-auto p-2">
        {filtered.length ? filtered.map((command, index) => <button key={command.id} type="button" onMouseEnter={() => setActive(index)} onClick={() => run(index)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ${active === index ? "bg-sky-500/15 text-[var(--text-main)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"}`}>
          <Command className="size-3.5 shrink-0 opacity-60" /><span className="min-w-0 flex-1 truncate text-xs">{command.label}</span><span className="text-[9px] text-[var(--text-muted)]">{command.group}</span>{active === index && <ArrowRight className="size-3.5 text-sky-400" />}
        </button>) : <p className="p-8 text-center text-xs text-[var(--text-muted)]">No matching actions.</p>}
      </div>
      <div className="flex justify-between border-t border-[var(--border-base)] px-3 py-2 text-[9px] text-[var(--text-muted)]"><span>↑↓ to navigate · Enter to run</span><span>Ctrl/⌘ K</span></div>
    </section>
  </div>;
}
