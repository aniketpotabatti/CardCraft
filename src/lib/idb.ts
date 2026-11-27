import { get, set, setMany, del, keys } from "idb-keyval";
import type { BrandKit, Layer, Project } from "../model/types";

const PROJECT_KEY = "card-studio:project";
const PROJECT_PREFIX = "card-studio:project:";
const CURRENT_PROJECT_KEY = "card-studio:current-project";
const ASSET_PREFIX = "card-studio:asset:";
const ASSET_META_PREFIX = "card-studio:asset-meta:";
const BRAND_KITS_KEY = "card-studio:brand-kits";
const HISTORY_PREFIX = "card-studio:history:";
const COMPONENT_PREFIX = "card-studio:component:";

export interface ReusableComponent {
  id: string;
  name: string;
  createdAt: number;
  width: number;
  height: number;
  layers: Layer[];
  assets: Record<string, Blob>;
}

export interface NamedSnapshot {
  id: string;
  name: string;
  createdAt: number;
  project: Project;
  assets?: Record<string, Blob>;
}

export function projectAssetIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const slide of project.slides) {
    if (slide.background.kind === "image") ids.add(slide.background.assetId);
    for (const owner of [slide, ...slide.layers]) for (const paint of [...(owner.fills ?? []), ...(owner.strokes ?? [])]) {
      if (paint.assetId) ids.add(paint.assetId);
      if (paint.posterId) ids.add(paint.posterId);
    }
    for (const layer of slide.layers) if (layer.type === "image") {
      ids.add(layer.assetId);
      if (layer.videoAssetId) ids.add(layer.videoAssetId);
    }
  }
  return [...ids];
}

export async function captureProjectAssets(project: Project): Promise<Record<string, Blob>> {
  return captureAssets(projectAssetIds(project));
}

export async function captureAssets(ids: string[]): Promise<Record<string, Blob>> {
  const entries = await Promise.all([...new Set(ids)].map(async (id) => [id, await loadAsset(id)] as const));
  const assets: Record<string, Blob> = Object.create(null);
  for (const [id, blob] of entries) {
    if (!(blob instanceof Blob)) throw new Error(`Image ${id} is missing. Restore or replace it before saving.`);
    assets[id] = blob;
  }
  return assets;
}

export async function loadReusableComponents(): Promise<ReusableComponent[]> {
  const allKeys = await keys();
  const components = await Promise.all(
    allKeys.filter((key): key is string => typeof key === "string" && key.startsWith(COMPONENT_PREFIX))
      .map((key) => get<ReusableComponent>(key)),
  );
  return components.filter((item): item is ReusableComponent => !!item && Array.isArray(item.layers))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveReusableComponent(component: ReusableComponent): Promise<void> {
  await set(COMPONENT_PREFIX + component.id, component);
}

export async function deleteReusableComponent(id: string): Promise<void> {
  await del(COMPONENT_PREFIX + id);
}

export async function saveProject(project: Project, outgoing?: Project, assets?: Record<string, Blob>): Promise<void> {
  const records: [string, Project | string | Blob][] = [
    [PROJECT_PREFIX + project.id, project],
    [CURRENT_PROJECT_KEY, project.id],
  ];
  if (outgoing && outgoing.id !== project.id) records.push([PROJECT_PREFIX + outgoing.id, outgoing]);
  for (const [id, blob] of Object.entries(assets ?? {})) records.push([ASSET_PREFIX + id, blob]);
  await setMany(records);
}

export async function loadProject(): Promise<Project | undefined> {
  const currentId = await get<string>(CURRENT_PROJECT_KEY);
  if (currentId) {
    const current = await get<Project>(PROJECT_PREFIX + currentId);
    if (current) return current;
  }
  const legacy = await get<Project>(PROJECT_KEY);
  if (legacy) {
    await saveProject(legacy);
    await del(PROJECT_KEY);
    return legacy;
  }
  const mostRecent = (await loadProjects())[0];
  if (mostRecent) {
    await saveProject(mostRecent);
    return mostRecent;
  }
  return undefined;
}

export async function loadProjects(): Promise<Project[]> {
  const allKeys = await keys();
  const projects = await Promise.all(
    allKeys.filter((key): key is string => typeof key === "string" && key.startsWith(PROJECT_PREFIX))
      .map((key) => get<Project>(key)),
  );
  return projects.filter((project): project is Project => !!project && Array.isArray(project.slides))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteStoredProject(id: string): Promise<void> {
  await del(PROJECT_PREFIX + id);
}

export async function saveAsset(id: string, blob: Blob): Promise<void> {
  await set(ASSET_PREFIX + id, blob);
}

export interface AssetMetadata { name?: string; folder?: string }

export async function saveAssetMetadata(id: string, metadata: AssetMetadata): Promise<void> {
  await set(ASSET_META_PREFIX + id, metadata);
}

export async function loadAsset(id: string): Promise<Blob | undefined> {
  return get<Blob>(ASSET_PREFIX + id);
}

export async function deleteAsset(id: string): Promise<void> {
  await Promise.all([del(ASSET_PREFIX + id), del(ASSET_META_PREFIX + id)]);
}

export async function loadAllAssetMetadata(): Promise<Record<string, AssetMetadata>> {
  const allKeys = await keys();
  const result: Record<string, AssetMetadata> = {};
  await Promise.all(allKeys.map(async (key) => {
    if (typeof key === "string" && key.startsWith(ASSET_META_PREFIX)) {
      const stored = await get<AssetMetadata | string>(key);
      const metadata = typeof stored === "string" ? { name: stored } : stored;
      if (metadata) result[key.slice(ASSET_META_PREFIX.length)] = metadata;
    }
  }));
  return result;
}

export async function loadAllAssets(): Promise<Record<string, Blob>> {
  const allKeys = await keys();
  const result: Record<string, Blob> = {};
  await Promise.all(
    allKeys.map(async (key) => {
      if (typeof key === "string" && key.startsWith(ASSET_PREFIX) && !key.startsWith(ASSET_META_PREFIX)) {
        const blob = await get<Blob>(key);
        if (blob) result[key.slice(ASSET_PREFIX.length)] = blob;
      }
    }),
  );
  return result;
}

export async function loadBrandKits(): Promise<BrandKit[]> {
  return (await get<BrandKit[]>(BRAND_KITS_KEY)) ?? [];
}

export async function saveBrandKits(kits: BrandKit[]): Promise<void> {
  await set(BRAND_KITS_KEY, kits);
}

export async function loadSnapshots(): Promise<NamedSnapshot[]> {
  const allKeys = await keys();
  const snapshots = await Promise.all(
    allKeys.filter((key): key is string => typeof key === "string" && key.startsWith(HISTORY_PREFIX))
      .map((key) => get<NamedSnapshot>(key)),
  );
  return snapshots.filter((snapshot): snapshot is NamedSnapshot => !!snapshot)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSnapshot(snapshot: NamedSnapshot): Promise<void> {
  await set(HISTORY_PREFIX + snapshot.id, snapshot);
}

export async function deleteSnapshot(id: string): Promise<void> {
  await del(HISTORY_PREFIX + id);
}
