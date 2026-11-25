import { useEffect, useState } from "react";

export function useHtmlImage(url?: string) {
  const [image, setImage] = useState<HTMLImageElement | undefined>();

  // When there is no URL there is no image to show. Derive this during render
  // instead of resetting state synchronously inside an effect.
  if (!url && image !== undefined) {
    setImage(undefined);
  }

  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return image;
}
