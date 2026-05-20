const SAMPLE_BYTES = 4096;

const acceptedImageMimeTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const imageMimeByExtension = new Map([
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

const textMimeTypes = new Set(["application/json", "application/ld+json", "application/toml", "application/x-toml", "application/x-yaml", "application/xml", "application/yaml"]);

const acceptedTextExtensions = [
  "astro",
  "bash",
  "c",
  "cc",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "cxx",
  "fish",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "log",
  "md",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svelte",
  "svg",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
];

export const SESSION_ATTACHMENT_ACCEPT = [...acceptedImageMimeTypes, "text/*", ...textMimeTypes, ...acceptedTextExtensions.map((extension) => `.${extension}`)].join(",");

export function fileExtension(name: string): string {
  const extension = name.split(".").pop();
  return extension && extension !== name ? extension.toLowerCase() : "";
}

function normalizedMimeType(type: string): string {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isTextMimeType(mime: string): boolean {
  if (!mime) return false;

  if (mime.startsWith("text/")) return true;
  if (textMimeTypes.has(mime)) return true;
  if (mime.endsWith("+json")) return true;
  if (mime.endsWith("+xml")) return true;

  return false;
}

function bytesLookLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;

  let controlByteCount = 0;
  for (const byte of bytes) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) controlByteCount += 1;
  }

  return controlByteCount / bytes.length <= 0.3;
}

/** Returns whether a file should require a selected model with image support. */
export function fileRequiresImageCapability(file: File): boolean {
  const mime = normalizedMimeType(file.type);
  if (acceptedImageMimeTypes.includes(mime)) return true;

  const fallbackMime = imageMimeByExtension.get(fileExtension(file.name));
  return Boolean(fallbackMime) && (!mime || mime === "application/octet-stream");
}

/** Resolves the attachment MIME type from browser metadata, extension fallback, and text sniffing. */
export function attachmentMime(file: File, buffer: ArrayBuffer): string | undefined {
  const mime = normalizedMimeType(file.type);
  if (acceptedImageMimeTypes.includes(mime)) return mime;

  const fallbackMime = imageMimeByExtension.get(fileExtension(file.name));
  if ((!mime || mime === "application/octet-stream") && fallbackMime) return fallbackMime;

  if (isTextMimeType(mime)) return "text/plain";

  const sample = new Uint8Array(buffer.slice(0, SAMPLE_BYTES));
  if (bytesLookLikeText(sample)) return "text/plain";
}
