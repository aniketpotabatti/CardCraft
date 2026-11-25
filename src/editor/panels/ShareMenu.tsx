import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  FileArchive,
  FileDown,
  FileUp,
  Image as ImageIcon,
  Share2,
  Sparkles,
  Users,
  Check,
} from "lucide-react";
import { Button, NativeSelect } from "../../app/ui";
import { copyActivePngToClipboard, exportActivePng } from "../../export/png";
import { exportCarouselZip } from "../../export/zip";
import { exportMultiFormatQueue } from "../../export/queue";
import { activeSlide, useEditorStore } from "../../model/store";

interface ShareMenuProps {
  onSaveFile: () => void;
  onImportFile?: () => void;
  onBeforeExport?: () => Promise<(() => void) | undefined>;
  onOpenCollaboration?: () => void;
  className?: string;
}

export function ShareMenu({
  onSaveFile,
  onImportFile,
  onBeforeExport,
  onOpenCollaboration,
  className = "",
}: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"export" | "collaborate" | "file">("export");
  const [multiplier, setMultiplier] = useState(2);
  const [busy, setBusy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exportPreset, setExportPreset] = useState("social");
  const [queueFormat, setQueueFormat] = useState<"both" | "image/png" | "image/webp">("both");
  const [queueProgress, setQueueProgress] = useState<{ completed: number; total: number; current: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const slides = useEditorStore((s) => s.project.slides.length);
  const slide = useEditorStore((s) => activeSlide(s));

  const exportWidth = (slide?.width ?? 1080) * multiplier;
  const exportHeight = (slide?.height ?? 1350) * multiplier;
  const presets = {
    social: { label: "Social post · PNG · 1×", multiplier: 1, format: "image/png" as const },
    web: { label: "Web optimized · WebP · 2×", multiplier: 2, format: "image/webp" as const },
    print: { label: "High resolution · PNG · 3×", multiplier: 3, format: "image/png" as const },
  };

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const run = async (task: () => Promise<{ clamped: boolean }>, successMsg = "Exported successfully.") => {
    let restoreCanvas: (() => void) | undefined;
    setBusy(true);
    setMessage(null);
    setOpen(false);
    try {
      restoreCanvas = await onBeforeExport?.();
      const { clamped } = await task();
      setMessage(clamped ? "Exported (resolution clamped to safe limits)." : successMsg);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
    } finally {
      restoreCanvas?.();
      setBusy(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const runQueue = async () => {
    const formats: ("image/png" | "image/webp")[] = queueFormat === "both" ? ["image/png", "image/webp"] : [queueFormat];
    let restoreCanvas: (() => void) | undefined;
    setBusy(true);
    setMessage(null);
    setQueueProgress({ completed: 0, total: slides * formats.length, current: "Preparing export…" });
    try {
      restoreCanvas = await onBeforeExport?.();
      const { clamped } = await exportMultiFormatQueue(multiplier, (completed, total, current) => setQueueProgress({ completed, total, current }), formats);
      const formatLabel = formats.map((format) => format === "image/png" ? "PNG" : "WebP").join(" and ");
      setMessage(clamped ? "Export queue complete; some images used the browser's safe resolution limit." : `${formatLabel} files exported.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export queue failed.");
    } finally {
      restoreCanvas?.();
      setBusy(false);
      setQueueProgress(null);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open share and export menu"
        className="flex h-8 items-center gap-1.5 rounded-lg bg-[#0c8ce9] px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0b7ecf] active:scale-[0.98] disabled:opacity-50"
      >
        <Share2 className="size-3.5" />
        <span>Share</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Share and export actions"
          className="ui-popover ui-popover--top-right absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] p-3 text-[var(--text-main)] shadow-2xl animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header tabs */}
          <div className="flex items-center rounded-xl bg-[var(--bg-surface-elevated)] p-1 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("export")}
              className={`flex-1 rounded-lg py-1 transition ${
                activeTab === "export"
                  ? "bg-[var(--bg-surface)] font-semibold text-[var(--text-main)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("collaborate")}
              className={`flex-1 rounded-lg py-1 transition ${
                activeTab === "collaborate"
                  ? "bg-[var(--bg-surface)] font-semibold text-[var(--text-main)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              Collaborate
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("file")}
              className={`flex-1 rounded-lg py-1 transition ${
                activeTab === "file"
                  ? "bg-[var(--bg-surface)] font-semibold text-[var(--text-main)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              Project
            </button>
          </div>

          {activeTab === "export" && (
            <div className="mt-3 space-y-3">
              {/* Resolution Multiplier */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">Resolution scale</span>
                  <div className="flex rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] p-0.5">
                    {[1, 2, 3].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMultiplier(val)}
                        className={`h-6 rounded-md px-2.5 text-xs font-mono font-medium transition ${
                          multiplier === val
                            ? "bg-[#0c8ce9] text-white font-bold shadow-xs"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                        }`}
                        title={`${val}× multiplier`}
                      >
                        {val}×
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                  <span>Output size</span>
                  <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {exportWidth} × {exportHeight} px
                  </span>
                </div>
              </div>

              {/* Preset Selector */}
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <NativeSelect
                  aria-label="Export preset"
                  value={exportPreset}
                  onChange={(event) => setExportPreset(event.target.value)}
                  className="h-8 text-xs"
                >
                  {Object.entries(presets).map(([id, preset]) => (
                    <option key={id} value={id}>
                      {preset.label}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  variant="default"
                  className="h-8 text-xs px-2.5"
                  disabled={busy}
                  onClick={() => {
                    const preset = presets[exportPreset as keyof typeof presets];
                    void run(() => exportActivePng({ multiplier: preset.multiplier, format: preset.format }));
                  }}
                >
                  Export
                </Button>
              </div>

              <div className="border-t border-[var(--border-base)] pt-2" />

              {/* Actions List */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => void run(() => copyActivePngToClipboard(multiplier), "Copied image to clipboard!")}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-[var(--bg-surface-elevated)]"
                >
                  <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Copy className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text-main)]">Copy to Clipboard</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Paste directly into Discord, Slack, etc.</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => void run(() => exportActivePng({ multiplier, format: "image/png" }))}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-[var(--bg-surface-elevated)]"
                >
                  <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
                    <ImageIcon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text-main)]">Download PNG ({multiplier}×)</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Lossless high-res raster</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => void run(() => exportActivePng({ multiplier, format: "image/webp" }))}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-[var(--bg-surface-elevated)]"
                >
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text-main)]">Download WebP ({multiplier}×)</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Smaller file size for web & mobile</div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={slides < 1}
                  onClick={() => void run(() => exportCarouselZip(multiplier))}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-[var(--bg-surface-elevated)] disabled:opacity-40"
                >
                  <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <FileArchive className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text-main)]">Download ZIP Archive</div>
                    <div className="text-[10px] text-[var(--text-muted)]">All {slides} pages in one package</div>
                  </div>
                </button>
              </div>

              {/* Queue Export */}
              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/40 p-2">
                <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                  <span>Batch format</span>
                  <NativeSelect
                    aria-label="Export queue format"
                    value={queueFormat}
                    onChange={(event) => setQueueFormat(event.target.value as typeof queueFormat)}
                    className="h-6 w-28 text-[10px]"
                  >
                    <option value="both">PNG + WebP</option>
                    <option value="image/png">PNG only</option>
                    <option value="image/webp">WebP only</option>
                  </NativeSelect>
                </div>
                <button
                  type="button"
                  disabled={busy || slides < 1}
                  onClick={() => void runQueue()}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--bg-surface-elevated)] py-1.5 text-xs font-medium text-[var(--text-main)] transition hover:bg-[var(--btn-default-hover)] disabled:opacity-40"
                >
                  <Download className="size-3.5" />
                  Export All Slides in Batch
                </button>
                {queueProgress && (
                  <div className="mt-2 grid gap-1 text-[10px] text-[var(--text-muted)]">
                    <div className="flex justify-between">
                      <span>{queueProgress.current}</span>
                      <span>{queueProgress.completed}/{queueProgress.total}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-input)]">
                      <div
                        className="h-full bg-sky-500 transition-[width]"
                        style={{ width: `${queueProgress.total ? (queueProgress.completed / queueProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "collaborate" && (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/40 p-3">
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-sky-500/10 text-sky-500">
                    <Users className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-main)]">Live Collaboration</h3>
                    <p className="text-[10px] text-[var(--text-muted)]">Design together with your team in real time</p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <Button
                    variant="accent"
                    className="w-full justify-center h-8 text-xs font-semibold"
                    onClick={() => {
                      setOpen(false);
                      onOpenCollaboration?.();
                    }}
                  >
                    Open Live Collaboration Room
                  </Button>

                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                  >
                    {copiedLink ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    <span>{copiedLink ? "Link copied to clipboard!" : "Copy Project URL"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "file" && (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSaveFile();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-[var(--bg-surface-elevated)]"
              >
                <div className="flex size-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                  <FileDown className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[var(--text-main)]">Save Project File</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Download portable .cardcraft bundle</div>
                </div>
              </button>

              {onImportFile && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onImportFile();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-[var(--bg-surface-elevated)]"
                >
                  <div className="flex size-7 items-center justify-center rounded-lg bg-slate-500/10 text-slate-400">
                    <FileUp className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text-main)]">Open Project File</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Restore from .cardcraft file</div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="ui-popover ui-popover--top-right absolute right-0 top-full mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg animate-in fade-in"
        >
          {message}
        </div>
      )}
    </div>
  );
}
