import { ensureMap, readSharedProject, writeSharedProject } from "./shared-project";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { LockKeyhole, Radio, UnlockKeyhole, X } from "lucide-react";
import { Button, Input, Modal } from "../app/ui";
import { loadAsset, projectAssetIds, saveAsset, saveBrandKits } from "../lib/idb";
import { useEditorStore } from "../model/store";
import type { Project } from "../model/types";
import { readStoredValue, writeStoredValue } from "../lib/safe-storage";

type RemoteCursor = { id: number; name: string; color: string; x: number; y: number };

export function CollaborationPanel({ open, onOpenChange, onRevealSelection }: { open: boolean; onOpenChange: (open: boolean) => void; onRevealSelection: () => void }) {
  const [invitation] = useState(() => new URLSearchParams(location.search));
  const [room, setRoom] = useState(() => invitation.get("room") ?? "");
  const [linkStatus, setLinkStatus] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(() => readStoredValue("cardcraft:collab-name") ?? "Designer");
  const [activeRoom, setActiveRoom] = useState("");
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [error, setError] = useState("");
  const [isRoomOwner, setIsRoomOwner] = useState(false);
  const sharedBrandLocked = useEditorStore((state) => state.sharedBrandLocked);
  const setSharedBrandLocked = useEditorStore((state) => state.setSharedBrandLocked);
  const roomOwnerRef = useRef(false);
  const stopSyncRef = useRef<(() => void) | null>(null);
  const applyingRemote = useRef(false);
  const syncReady = useRef(false);

  const peers = useMemo(() => cursors.length, [cursors]);

  const disconnect = useCallback(() => {
    stopSyncRef.current?.();
    stopSyncRef.current = null;
    syncReady.current = false;
    roomOwnerRef.current = false;
    setIsRoomOwner(false);
    setSharedBrandLocked(false);
    setConnected(false);
    setJoining(false);
    setActiveRoom("");
    setLinkStatus("");
    setCursors([]);
  }, [setSharedBrandLocked]);

  useEffect(() => () => disconnect(), [disconnect]);

  const copySelectionLink = async () => {
    const state = useEditorStore.getState();
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set("room", activeRoom);
    url.searchParams.set("project", state.project.id);
    url.searchParams.set("page", state.selectedSlideId);
    if (state.selectedLayerIds.length === 1) url.searchParams.set("layer", state.selectedLayerIds[0]);
    try {
      await navigator.clipboard.writeText(url.href);
      setLinkStatus("Link copied. Share the room passphrase separately.");
    } catch {
      setLinkStatus(url.href);
    }
  };

  const connect = (create: boolean) => {
    const roomId = create ? nanoid(12) : room.trim();
    if (roomId.length < 6 || password.length < 8) {
      setError("Use a room code of at least 6 characters and a shared passphrase of at least 8 characters.");
      return;
    }
    disconnect();
    setRoom(roomId);
    setJoining(!create);
    setError("");
    writeStoredValue("cardcraft:collab-name", name.trim() || "Designer");
    const doc = new Y.Doc();
    const provider = new WebrtcProvider(`cardcraft-${roomId}`, doc, { password, maxConns: 8 });
    const importingAssets = new Set<string>();
    const uploadingAssets = new Set<string>();
    const sharedProject = doc.getMap<unknown>("project");
    const clientId = String(provider.awareness.clientID);
    const syncRoomPermissions = () => {
      const owner = sharedProject.get("room-owner");
      if (typeof owner === "string") {
        roomOwnerRef.current = owner === clientId;
        setIsRoomOwner(roomOwnerRef.current);
      } else {
        sharedProject.set("room-owner", clientId);
        roomOwnerRef.current = true;
        setIsRoomOwner(true);
      }
      const locked = sharedProject.get("shared-brand-locked") === true;
      if (useEditorStore.getState().sharedBrandLocked !== locked) setSharedBrandLocked(locked);
    };
    const shared = () => {
      if (syncReady.current) return;
      const next = readSharedProject(sharedProject);
      if (!create && !next?.slides.length) return;
      syncReady.current = true;
      syncRoomPermissions();
      if (next?.slides?.length) {
        applyingRemote.current = true;
        useEditorStore.getState().replaceProject(next);
        applyingRemote.current = false;
      } else {
        writeSharedProject(sharedProject, useEditorStore.getState().project);
      }
      const sharedBrandKits = readSharedBrandKits(sharedProject);
      if (sharedBrandKits) {
        applyingRemote.current = true;
        useEditorStore.setState({ savedBrandKits: sharedBrandKits });
        void saveBrandKits(sharedBrandKits);
        applyingRemote.current = false;
      } else {
        writeSharedBrandKits(sharedProject, useEditorStore.getState().savedBrandKits);
      }
      void importSharedAssets(sharedProject, importingAssets);
      void syncProjectAssets(sharedProject, useEditorStore.getState().project, uploadingAssets);
      setConnected(true);
      setJoining(false);
      setActiveRoom(roomId);
      if (!create && next && invitation.get("room") === roomId && invitation.get("project") === next.id) {
        const page = next.slides.find(item => item.id === invitation.get("page"));
        const target = page?.layers.find(item => item.id === invitation.get("layer"));
        if (page) {
          useEditorStore.getState().selectSlide(page.id);
          if (target) useEditorStore.getState().selectLayer(target.id);
          onRevealSelection();
        }
      }
    };
    provider.on("synced", ({ synced }) => { if (synced) shared(); });
    provider.awareness.setLocalStateField("user", {
      name: name.trim() || "Designer",
      color: `hsl(${Math.abs([...name].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7)) % 360} 78% 62%)`,
    });
    const updateCursors = () => {
      const states = Array.from(provider.awareness.getStates().entries())
        .filter(([id, state]) => id !== provider.awareness.clientID && state.user && state.cursor)
        .map(([id, state]) => ({
          id,
          name: String(state.user.name ?? "Designer"),
          color: String(state.user.color ?? "#38bdf8"),
          x: Number(state.cursor.x),
          y: Number(state.cursor.y),
        }));
      setCursors(states);
    };
    provider.awareness.on("change", updateCursors);

    const observer = (events: Y.YEvent<any>[]) => {
      if (applyingRemote.current || events.every((event) => event.transaction.local)) return;
      if (!syncReady.current) { shared(); return; }
      syncRoomPermissions();
      const changedProject = events.some(event => {
        const keys = event.path.length ? [String(event.path[0])] : Array.from(event.changes.keys.keys());
        return keys.some(key => key !== "room-owner" && !key.startsWith("shared-"));
      });
      const next = changedProject ? readSharedProject(sharedProject) : undefined;
      if (next?.slides?.length) {
        applyingRemote.current = true;
        useEditorStore.getState().replaceProject(next);
        applyingRemote.current = false;
      }
      const sharedBrandKits = readSharedBrandKits(sharedProject);
      if (sharedBrandKits && JSON.stringify(sharedBrandKits) !== JSON.stringify(useEditorStore.getState().savedBrandKits)) {
        applyingRemote.current = true;
        useEditorStore.setState({ savedBrandKits: sharedBrandKits });
        void saveBrandKits(sharedBrandKits);
        applyingRemote.current = false;
      }
      void importSharedAssets(sharedProject, importingAssets);
    };
    sharedProject.observeDeep(observer);
    const editor = document.getElementById("cardcraft-main");
    const onPointerMove = (event: PointerEvent) => {
      provider.awareness.setLocalStateField("cursor", {
        x: Math.max(0, Math.min(1, event.clientX / window.innerWidth)),
        y: Math.max(0, Math.min(1, event.clientY / window.innerHeight)),
      });
    };
    const onPointerLeave = () => provider.awareness.setLocalStateField("cursor", null);
    editor?.addEventListener("pointermove", onPointerMove);
    editor?.addEventListener("pointerleave", onPointerLeave);

    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (applyingRemote.current || !syncReady.current) return;
      if (state.project.id !== previous.project.id) {
        disconnect();
        return;
      }
      if (state.project !== previous.project) {
        writeSharedProject(sharedProject, state.project);
        void syncProjectAssets(sharedProject, state.project, uploadingAssets);
      }
      if (state.savedBrandKits !== previous.savedBrandKits) writeSharedBrandKits(sharedProject, state.savedBrandKits);
      if (state.sharedBrandLocked !== previous.sharedBrandLocked && roomOwnerRef.current) {
        sharedProject.set("shared-brand-locked", state.sharedBrandLocked);
      }
    });
    stopSyncRef.current = () => {
      unsubscribe();
      sharedProject.unobserveDeep(observer);
      provider.awareness.off("change", updateCursors);
      editor?.removeEventListener("pointermove", onPointerMove);
      editor?.removeEventListener("pointerleave", onPointerLeave);
      doc.destroy();
    };
    if (create) shared();
  };

  return (
    <>
      {connected && cursors.map((cursor) => (
        <div key={cursor.id} className="pointer-events-none fixed z-[90]" style={{ left: `calc(${cursor.x * 100}vw)`, top: `calc(${cursor.y * 100}vh)` }}>
          <div className="size-3 rotate-[-35deg] rounded-sm border-2 border-white shadow" style={{ background: cursor.color }} />
          <span className="mt-1 block rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow" style={{ background: cursor.color }}>{cursor.name}</span>
        </div>
      ))}
      <Modal open={open} onOpenChange={onOpenChange} title="Live collaboration">
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-800 dark:text-sky-100">
          <Radio className="mt-0.5 size-4 shrink-0" />
          <p>Share a room code and passphrase with collaborators. Project edits, referenced image assets, and cursors sync peer-to-peer; signaling uses public Yjs servers.</p>
        </div>
        {connected ? (
          <div className="grid gap-3">
            <p className="text-sm text-[var(--text-main)]">Connected to room <span className="font-mono font-semibold">{activeRoom}</span></p>
            <p className="text-xs text-[var(--text-muted)]">{peers} collaborator{peers === 1 ? "" : "s"} currently sharing a cursor.</p>
            {isRoomOwner && <Button variant="ghost" onClick={() => setSharedBrandLocked(!sharedBrandLocked)}>{sharedBrandLocked ? <UnlockKeyhole className="size-3.5" /> : <LockKeyhole className="size-3.5" />}{sharedBrandLocked ? "Unlock shared brand kit" : "Lock shared brand kit"}</Button>}
            {sharedBrandLocked && <p className="text-[11px] text-amber-800 dark:text-amber-200">Brand-kit editing is locked for collaborators in this room.</p>}
            <Button onClick={() => void copySelectionLink()}>Copy selection link</Button>
            {linkStatus && <p role="status" className="break-all">{linkStatus}</p>}
            <Button variant="danger" onClick={() => { disconnect(); onOpenChange(false); }}>Leave room</Button>
          </div>
        ) : joining ? (
          <div className="grid gap-3"><p role="status">Waiting for a peer in room {room}.</p><Button onClick={disconnect}>Cancel join</Button></div>
        ) : (
          <div className="grid max-w-md gap-3">
            <FieldWrap label="Your display name"><Input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} /></FieldWrap>
            <FieldWrap label="Room code"><Input value={room} placeholder="Paste a room code to join" onChange={(event) => setRoom(event.target.value)} /></FieldWrap>
            <FieldWrap label="Shared passphrase"><Input type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} /></FieldWrap>
            {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
            <div className="flex gap-2"><Button variant="accent" onClick={() => connect(true)}>Create room</Button><Button onClick={() => connect(false)}>Join room</Button></div>
            <p className="text-[10px] text-[var(--text-muted)]">Everyone needs the same room code and passphrase. Share them privately; anyone with both can edit this project.</p>
          </div>
        )}
        <button type="button" className="absolute right-4 top-4 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]" onClick={() => onOpenChange(false)} aria-label="Close collaboration"><X className="size-4" /></button>
      </Modal>
    </>
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>{children}</label>;
}

function writeSharedBrandKits(root: Y.Map<unknown>, brandKits: Project["brand"][]) {
  if (JSON.stringify(root.get("shared-brand-kits")) === JSON.stringify(brandKits)) return;
  root.doc?.transact(() => root.set("shared-brand-kits", structuredClone(brandKits)), "cardcraft-shared-brand-kits");
}

function readSharedBrandKits(root: Y.Map<unknown>) {
  const value = root.get("shared-brand-kits");
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is Project["brand"] => !!item && typeof item === "object" && Array.isArray((item as Project["brand"]).palette));
}

async function syncProjectAssets(root: Y.Map<unknown>, project: Project, pending: Set<string>) {
  const assets = ensureMap(root, "shared-assets");
  await Promise.all(projectAssetIds(project).map(async (id) => {
    if (assets.has(id) || pending.has(id)) return;
    pending.add(id);
    try {
      const blob = await loadAsset(id);
      if (!blob) return;
      const data = new Uint8Array(await blob.arrayBuffer());
      assets.set(id, { type: blob.type, data });
    } finally {
      pending.delete(id);
    }
  }));
}

async function importSharedAssets(root: Y.Map<unknown>, imported: Set<string>) {
  const assets = root.get("shared-assets");
  if (!(assets instanceof Y.Map)) return;
  await Promise.all(Array.from((assets as Y.Map<unknown>).entries()).map(async ([id, entry]) => {
    if (imported.has(id) || !entry || typeof entry !== "object") return;
    const data = (entry as { data?: unknown }).data;
    const type = (entry as { type?: unknown }).type;
    if (!(data instanceof Uint8Array)) return;
    imported.add(id);
    const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const blob = new Blob([bytes], { type: typeof type === "string" ? type : "application/octet-stream" });
    await saveAsset(id, blob);
    useEditorStore.getState().registerAsset(id, { url: URL.createObjectURL(blob) });
  }));
}
