import { useEffect, useRef } from "react";
import type { AssetInfo } from "../../model/store";
import type { Slide } from "../../model/types";

export function usePaintMedia(slide: Slide | undefined, assets: Record<string, AssetInfo>, play: boolean, redraw: () => void) {
  const media = useRef(new Map<string, HTMLImageElement | HTMLVideoElement>());
  const redrawRef = useRef(redraw);
  redrawRef.current = redraw;
  const images = new Set<string>(), videos = new Set<string>();
  for (const owner of slide ? [slide, ...slide.layers] : []) {
    for (const paint of [...(owner.fills ?? []), ...(owner.strokes ?? [])]) {
      if (paint.kind === "image" && paint.assetId) images.add(paint.assetId);
      if (paint.kind === "video") {
        if (paint.posterId) images.add(paint.posterId);
        if (play && paint.assetId) videos.add(paint.assetId);
      }
    }
  }
  const serialize = (ids: Set<string>) => JSON.stringify([...ids].sort().filter(id => assets[id]).map(id => [id, assets[id].url]));
  const imageInputs = serialize(images);
  const videoInputs = serialize(videos);
  useEffect(() => {
    const activeMedia = media.current;
    const cleanup = (JSON.parse(imageInputs) as [string, string][]).map(([id, url]) => {
      const element = new Image();
      element.onload = () => { activeMedia.set(id, element); redrawRef.current(); };
      element.src = url;
      return () => { element.onload = null; activeMedia.delete(id); };
    });
    return () => cleanup.forEach(dispose => dispose());
  }, [imageInputs]);
  useEffect(() => {
    const activeMedia = media.current;
    const cleanup = (JSON.parse(videoInputs) as [string, string][]).map(([id, url]) => {
      const element = document.createElement("video");
      element.muted = true;
      element.playsInline = true;
      element.loop = true;
      let frame = 0;
      const tick = () => { redrawRef.current(); frame = requestAnimationFrame(tick); };
      element.onloadeddata = () => {
        activeMedia.set(id, element);
        void element.play().catch(() => {});
        frame = requestAnimationFrame(tick);
      };
      element.src = url;
      return () => {
        cancelAnimationFrame(frame);
        element.onloadeddata = null;
        element.pause();
        element.removeAttribute("src");
        element.load();
        activeMedia.delete(id);
      };
    });
    return () => cleanup.forEach(dispose => dispose());
  }, [videoInputs]);
  return media.current;
}
