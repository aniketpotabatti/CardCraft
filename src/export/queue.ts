import { strToU8, Zip, ZipPassThrough } from "fflate";
import { downloadBlob, slugify } from "../lib/download";
import { useEditorStore } from "../model/store";
import { collectSlideBlobs } from "./png";

export async function exportMultiFormatQueue(
  multiplier: number,
  onProgress?: (completed: number, total: number, current: string) => void,
  formats: readonly ("image/png" | "image/webp")[] = ["image/png", "image/webp"],
): Promise<{ clamped: boolean }> {
  const slides = useEditorStore.getState().project.slides;
  const total = slides.length * formats.length;
  const archiveChunks: Uint8Array[] = [];
  let finishArchive!: (blob: Blob) => void;
  let failArchive!: (error: Error) => void;
  const archiveReady = new Promise<Blob>((resolve, reject) => {
    finishArchive = resolve;
    failArchive = reject;
  });
  void archiveReady.catch(() => undefined);
  const archive = new Zip((error, data, final) => {
    if (error) {
      failArchive(error);
      return;
    }
    if (data.length) archiveChunks.push(data);
    if (final) finishArchive(new Blob(archiveChunks as BlobPart[], { type: "application/zip" }));
  });
  let clamped = false;

  try {
    for (let formatIndex = 0; formatIndex < formats.length; formatIndex += 1) {
      const format = formats[formatIndex];
      const extension = format === "image/webp" ? "webp" : "png";
      const result = await collectSlideBlobs(
        multiplier,
        (index, slideCount) => {
          const completed = formatIndex * slideCount + index;
          onProgress?.(completed, total, `${extension.toUpperCase()} · slide ${index + 1} of ${slideCount}`);
        },
        format,
        async (blob, index) => {
          const entry = new ZipPassThrough(`${extension}/${String(index + 1).padStart(2, "0")}.${extension}`);
          archive.add(entry);
          entry.push(new Uint8Array(await blob.arrayBuffer()), true);
          onProgress?.(formatIndex * slides.length + index + 1, total, `${extension.toUpperCase()} · slide ${index + 1} of ${slides.length}`);
        },
      );
      clamped ||= result.clamped;
    }

    const readme = new ZipPassThrough("README.txt");
    archive.add(readme);
    readme.push(strToU8(`CardCraft export queue\nFormats: ${formats.map((format) => format === "image/webp" ? "WebP" : "PNG").join(", ")}\nSlides: ${slides.length}\nScale: ${multiplier}x`), true);
    archive.end();
    const blob = await archiveReady;
    const name = slugify(useEditorStore.getState().project.name);
    downloadBlob(blob, `${name}-export-queue.zip`);
    return { clamped };
  } catch (error) {
    archive.terminate();
    throw error;
  }
}
