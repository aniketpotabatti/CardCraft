import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ArrowUp, ChevronDown, Expand, Mic, MoreHorizontal, PanelLeft, Plus, Sparkles, X } from "lucide-react";
import { generateCaptionOptions, GeminiKeyError, readGeminiKey, saveGeminiKey } from "../../ai/captionGen";
import { Button, Input, Modal } from "../../app/ui";
import { layerName } from "../../model/names";
import { useEditorStore } from "../../model/store";

type Target = { pageId: string; layerId: string; name: string; original: string };
type Turn = { id: string; brief: string; target?: Target; options: string[]; applied?: number };
type Intent = "auto" | "draft";
type Recognition = EventTarget & {
  start(): void;
  stop(): void;
  abort(): void;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

const groups = [
  { label: "Tidy and polish", suggestions: ["Make this caption shorter and more direct.", "Rewrite this caption with a warmer tone."] },
  { label: "Generate designs", suggestions: ["Draft headlines for a new product announcement.", "Draft a caption for a quote card."] },
  { label: "Build with code", suggestions: [] },
  { label: "Create plugins and shaders", suggestions: [] },
] as const;

function editableTarget(): Target | undefined {
  const { project, selectedSlideId, selectedLayerIds } = useEditorStore.getState();
  const slide = project.slides.find(item => item.id === selectedSlideId);
  const layer = selectedLayerIds.length === 1 ? slide?.layers.find(item => item.id === selectedLayerIds[0]) : undefined;
  if (layer?.type !== "text" || layer.locked) return;
  return { pageId: selectedSlideId, layerId: layer.id, name: layerName(layer), original: layer.text };
}

export function AssistantPanel({ mount, floating, visible, onFloat, onDock, onClose }: {
  mount: HTMLElement | null;
  floating: boolean;
  visible: boolean;
  onFloat: () => void;
  onDock: () => void;
  onClose: () => void;
}) {
  const project = useEditorStore(state => state.project);
  useEditorStore(state => state.selectedSlideId);
  useEditorStore(state => state.selectedLayerIds);
  const selected = editableTarget();
  const [draft, setDraft] = useState("");
  const [intent, setIntent] = useState<Intent>("auto");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<{ brief: string; target?: Target }>();
  const [error, setError] = useState<{ message: string; key?: boolean }>();
  const [keySet, setKeySet] = useState(() => Boolean(readGeminiKey()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [group, setGroup] = useState<string>();
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  const voice = useRef<Recognition | undefined>(undefined);
  const composer = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const voiceWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  const Voice = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
  const target = intent === "auto" ? selected : undefined;

  useEffect(() => () => {
    controller.current?.abort();
    if (voice.current) {
      voice.current.onend = null;
      voice.current.onerror = null;
      voice.current.onresult = null;
      voice.current.abort();
    }
  }, []);
  useEffect(() => {
    const area = scroll.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [turns.length, pending, visible, floating, mount]);
  useEffect(() => {
    if (visible && floating) panel.current?.focus({ preventScroll: true });
  }, [floating, visible]);

  const openSettings = () => {
    const key = readGeminiKey();
    setKeySet(Boolean(key));
    setKeyDraft(key);
    setSettingsOpen(true);
  };
  const closeSettings = () => {
    setKeyDraft("");
    setSettingsOpen(false);
    requestAnimationFrame(() => composer.current?.focus());
  };
  const reset = () => {
    controller.current?.abort();
    controller.current = undefined;
    voice.current?.abort();
    setTurns([]);
    setPending(undefined);
    setError(undefined);
    setVoiceMessage("");
    setDraft("");
    setIntent("auto");
    setGroup(undefined);
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || controller.current) return;
    const key = readGeminiKey();
    if (!key) {
      setError({ message: "Enter a Gemini API key to send this prompt.", key: true });
      return;
    }
    const brief = draft.trim().replaceAll(key, "[API key removed]");
    const target = intent === "auto" ? editableTarget() : undefined;
    const request = new AbortController();
    controller.current = request;
    setError(undefined);
    setPending({ brief, target });
    const timeout = window.setTimeout(() => request.abort(), 45000);
    void generateCaptionOptions(key, brief, { original: target?.original, signal: request.signal }).then(options => {
      if (controller.current !== request) return;
      setTurns(previous => [...previous, { id: crypto.randomUUID(), brief, target, options }]);
      setDraft(previous => previous.trim().replaceAll(key, "[API key removed]") === brief ? "" : previous);
    }).catch((error: unknown) => {
      if (controller.current !== request) return;
      setError({
        message: request.signal.aborted ? "Gemini took too long to respond. Try again."
          : error instanceof Error ? error.message : "The Gemini request failed. Try again.",
        key: error instanceof GeminiKeyError,
      });
    }).finally(() => {
      window.clearTimeout(timeout);
      if (controller.current === request) {
        controller.current = undefined;
        setPending(undefined);
      }
    });
  }

  const fill = (suggestion: string, nextIntent: Intent) => {
    setDraft(suggestion);
    setIntent(nextIntent);
    composer.current?.focus();
  };
  const apply = (turn: Turn, index: number) => {
    const state = useEditorStore.getState();
    const layer = state.project.slides.find(item => item.id === turn.target?.pageId)?.layers.find(item => item.id === turn.target?.layerId);
    const text = turn.options[index];
    if (turn.target && layer?.type === "text" && !layer.locked) state.updateLayer(layer.id, { text }, turn.target.pageId);
    else state.addText(text);
    setTurns(previous => previous.map(item => item.id === turn.id ? { ...item, applied: index } : item));
  };

  const dictate = () => {
    if (!Voice) return;
    if (listening) { voice.current?.stop(); return; }
    const recognition = new Voice();
    voice.current = recognition;
    recognition.lang = navigator.language;
    recognition.onresult = event => {
      const text = Array.from(event.results, result => result[0]?.transcript ?? "").join(" ").trim();
      if (text) setDraft(previous => [previous.trimEnd(), text].filter(Boolean).join(" ").slice(0, 4000));
    };
    recognition.onend = () => { if (voice.current === recognition) setListening(false); };
    recognition.onerror = () => { setListening(false); setVoiceMessage("Voice input is unavailable. You can type your prompt."); };
    try { recognition.start(); setVoiceMessage(""); setListening(true); }
    catch { setVoiceMessage("Voice input is unavailable. You can type your prompt."); }
  };

  const destination = floating ? document.body : mount;
  if (!destination || !visible) return null;
  const keyLabel = keySet ? "Edit Gemini API key" : "Enter Gemini API key";
  const menuClass = "z-[60] min-w-40 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] p-1 text-xs shadow-lg";
  const itemClass = "cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-[var(--bg-surface-elevated)]";
  return <>
    {createPortal(<section ref={panel} tabIndex={-1} aria-label="Gemini Assistant"
      className={`flex h-full min-h-0 flex-col bg-[var(--bg-surface)] text-[var(--text-main)] ${floating ? "fixed right-3 top-16 z-35 h-[min(38rem,calc(100dvh-5rem))] w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[var(--border-base)] shadow-2xl" : ""}`}>
      <header className="flex shrink-0 items-center gap-1 border-b border-[var(--border-base)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{turns.length ? "Caption assistant" : "New chat"}</h2>
          <p className="text-[10px] text-[var(--text-muted)]">Gemini · Local conversation</p>
        </div>
        <Button type="button" variant="ghost" className="size-7 px-0" aria-label={floating ? "Dock Assistant" : "Pop out Assistant"} onClick={floating ? onDock : onFloat}>
          {floating ? <PanelLeft size={14} /> : <Expand size={14} />}
        </Button>
        <Menu.Root>
          <Menu.Trigger asChild><Button type="button" variant="ghost" className="size-7 px-0" aria-label="Assistant options"><MoreHorizontal size={15} /></Button></Menu.Trigger>
          <Menu.Portal><Menu.Content align="end" sideOffset={5} className={menuClass}>
            <Menu.Item className={itemClass} onSelect={reset}>New chat</Menu.Item>
            <Menu.Item className={itemClass} onSelect={openSettings}>{keyLabel}</Menu.Item>
          </Menu.Content></Menu.Portal>
        </Menu.Root>
        <Button type="button" variant="ghost" className="size-7 px-0" aria-label="Close Assistant" onClick={onClose}><X size={15} /></Button>
      </header>

      <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Assistant conversation">
        {!turns.length && !pending && <>
          <div className="mb-4 mt-3 grid justify-items-center gap-2 text-center">
            <span className="grid size-9 place-items-center rounded-xl bg-sky-500/12 text-sky-500"><Sparkles size={17} /></span>
            <h3 className="text-base font-semibold">What’s next?</h3>
            <p className="text-xs text-[var(--text-muted)]">Draft or revise captions for this design.</p>
          </div>
          <div className="grid gap-1">
            {groups.map(({ label, suggestions }, index) => <div key={label} className="rounded-lg border border-[var(--border-base)]">
              <button type="button" disabled={!suggestions.length} aria-expanded={group === label}
                className="flex w-full items-center gap-1 px-2 py-2 text-left text-xs font-medium disabled:text-[var(--text-muted)]"
                onClick={() => setGroup(previous => previous === label ? undefined : label)}>
                <span className="flex-1">{label}</span>
                {suggestions.length ? <ChevronDown size={13} /> : <span className="text-[10px]">Coming later</span>}
              </button>
              {group === label && <div className="grid gap-1 border-t border-[var(--border-base)] p-1">
                {suggestions.map(suggestion => <Button key={suggestion} type="button" variant="ghost"
                  className="h-auto justify-start whitespace-normal px-1.5 py-1 text-left" onClick={() => fill(suggestion, index === 0 ? "auto" : "draft")}>{suggestion}</Button>)}
              </div>}
            </div>)}
          </div>
        </>}
        <div role="log" aria-label="Assistant messages" className="grid gap-4">
          {turns.map(turn => {
            const destination = project.slides.find(item => item.id === turn.target?.pageId)?.layers.find(item => item.id === turn.target?.layerId);
            const canApply = destination?.type === "text" && !destination.locked;
            return <article key={turn.id} className="grid gap-2">
              <p className="break-words rounded-xl bg-[var(--bg-surface-elevated)] p-2 text-xs">{turn.brief}</p>
              {turn.target && <p className="break-words text-[11px] text-[var(--text-muted)]">Requested for {turn.target.name}</p>}
              {turn.target && !canApply && <p className="text-[11px] text-[var(--text-muted)]">The original layer is unavailable. You can insert a result as new text.</p>}
              {turn.options.map((text, index) => <div key={index} className="grid gap-2 rounded-lg border border-[var(--border-base)] p-2">
                <p className="break-words text-xs">{text}</p>
                <Button type="button" variant="ghost" className="h-auto justify-start px-1 py-1 text-left"
                  aria-label={canApply ? `Apply option ${index + 1} to ${turn.target?.name}` : `Insert option ${index + 1} as text`}
                  onClick={() => apply(turn, index)}>{turn.applied === index ? "Applied" : canApply ? "Apply to text layer" : "Insert as text"}</Button>
              </div>)}
            </article>;
          })}
        </div>
        {pending && <div className="grid gap-2 py-2">
          <p className="break-words rounded-xl bg-[var(--bg-surface-elevated)] p-2 text-xs">{pending.brief}</p>
          {pending.target && <p className="text-[11px] text-[var(--text-muted)]">Requested for {pending.target.name}</p>}
          <p role="status" className="text-xs text-[var(--text-muted)]">Gemini is drafting alternatives…</p>
        </div>}
      </div>

      <form aria-label="Assistant composer" onSubmit={submit} className="shrink-0 border-t border-[var(--border-base)] p-2">
        {error && <div className="mb-2 rounded-lg bg-rose-500/10 px-2 py-1.5 text-xs">
          <p role="alert">{error.message}</p>
          {error.key && <button type="button" className="mt-1 font-medium text-sky-600 underline" onClick={openSettings}>{keyLabel}</button>}
        </div>}
        <div className="mb-1 flex flex-wrap items-center gap-1">
          {selected && <Button type="button" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => fill("Rewrite this caption with three distinct alternatives.", "auto")}>Rewrite selected text</Button>}
          <Button type="button" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => fill("Draft a caption for ", "draft")}>Draft a caption</Button>
          {target && <span className="min-w-0 truncate text-[10px] text-[var(--text-muted)]" title={target.name}>{target.name}</span>}
        </div>
        <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-input)] px-1.5 pb-1">
          <textarea ref={composer} rows={2} maxLength={4000} aria-label="Ask for changes" placeholder="Ask for changes"
            value={draft} onChange={event => setDraft(event.target.value)} className="block min-h-12 w-full resize-none bg-transparent px-1.5 py-2 text-xs outline-none"
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} />
          <div className="flex items-center gap-1">
            <Menu.Root>
              <Menu.Trigger asChild><Button type="button" variant="ghost" className="size-7 px-0" aria-label="Add to prompt"><Plus size={16} /></Button></Menu.Trigger>
              <Menu.Portal><Menu.Content side="top" align="start" sideOffset={4} className={menuClass}>
                <Menu.Item className={itemClass} onSelect={openSettings}>{keyLabel}</Menu.Item>
              </Menu.Content></Menu.Portal>
            </Menu.Root>
            <div className="flex-1" />
            {Voice && <Button type="button" variant="ghost" className="size-7 px-0" aria-label={listening ? "Stop dictation" : "Dictate prompt"} aria-pressed={listening} onClick={dictate}><Mic size={15} /></Button>}
            <Button type="submit" variant="accent" className="size-7 px-0" aria-label="Send prompt" disabled={!draft.trim() || Boolean(pending)}><ArrowUp size={16} /></Button>
          </div>
          {voiceMessage && <p role="status" className="px-1 text-[10px]">{voiceMessage}</p>}
        </div>
      </form>
    </section>, destination)}

    <Modal open={settingsOpen} onOpenChange={open => { if (!open) closeSettings(); }} title="Gemini API key">
      <form className="grid gap-3" onSubmit={event => {
        event.preventDefault();
        if (!keyDraft.trim()) return;
        saveGeminiKey(keyDraft.trim());
        setKeySet(true);
        setError(undefined);
        closeSettings();
      }}>
        <label className="grid gap-1 text-xs">Gemini API key
          <Input type="password" autoComplete="off" value={keyDraft} onChange={event => setKeyDraft(event.target.value)} />
        </label>
        <p className="text-xs text-[var(--text-muted)]">The key is stored in this browser and sent to Gemini with your requests.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={closeSettings}>Cancel</Button>
          <Button type="submit" variant="accent" disabled={!keyDraft.trim()}>Save</Button>
        </div>
      </form>
    </Modal>
  </>;
}
