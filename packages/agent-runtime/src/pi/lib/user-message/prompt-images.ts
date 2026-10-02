import type {ImageContent, Model} from "@earendil-works/pi-ai";
import {convertToPng, formatDimensionNote, resizeImage} from "@earendil-works/pi-coding-agent";

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Prepares prompt images as the old SDK's `AgentSession.prompt` did: unsupported formats become PNG and, with
 * `images.autoResize`, images shrink to the model's inline limits. Images that cannot be prepared are dropped with a
 * hint the model sees in the prompt text. Mirrors pi-coding-agent's unexported `utils/image-process.ts`.
 */
export async function preparePromptImages(
  images: readonly ImageContent[],
  options: {readonly autoResize: boolean; readonly model: Model<never> | undefined}
): Promise<{readonly images: ImageContent[]; readonly hints: string[]}> {
  const prepared: ImageContent[] = [];
  const hints: string[] = [];
  for (const image of images) {
    let {data, mimeType} = image;
    const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? mimeType;
    if (!SUPPORTED_MIME_TYPES.has(base === "image/jpg" ? "image/jpeg" : base)) {
      const converted = await convertToPng(data, mimeType);
      if (!converted) {
        hints.push("[Image omitted: could not be converted to a supported inline image format.]");
        continue;
      }
      hints.push(`[Image converted from ${base} to image/png.]`);
      ({data, mimeType} = converted);
    }
    if (options.autoResize) {
      const resized = await resizeImage(Buffer.from(data, "base64"), mimeType, options.model?.inputLimits?.images?.resize);
      if (!resized) {
        hints.push("[Image omitted: could not be resized below the inline image size limit.]");
        continue;
      }
      const note = formatDimensionNote(resized);
      if (note) hints.push(note);
      ({data, mimeType} = resized);
    }
    prepared.push({type: "image", data, mimeType});
  }
  return {images: prepared, hints};
}
