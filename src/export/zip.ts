import { zip, strToU8 } from "fflate";
import { downloadBlob, slugify } from "../lib/download";
import { useEditorStore } from "../model/store";
import { collectSlideBlobs } from "./png";

export async function exportCarouselZip(multiplier: number, format: "image/png" | "image/webp" = "image/png", onProgress?: (index: number, total: number) => void): Promise<{ clamped: boolean }> {
  const { blobs, clamped } = await collectSlideBlobs(multiplier, onProgress, format);
  const extension = format === "image/webp" ? "webp" : "png";
  const files: Record<string, Uint8Array> = {};
  await Promise.all(
    blobs.map(async (blob, index) => {
      const buffer = new Uint8Array(await blob.arrayBuffer());
      files[`${String(index + 1).padStart(2, "0")}.${extension}`] = buffer;
    }),
  );
  files["readme.txt"] = strToU8("Exported from CardCraft");

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 0 }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const name = slugify(useEditorStore.getState().project.name);
  downloadBlob(new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" }), `${name}-carousel.zip`);
  return { clamped };
}
