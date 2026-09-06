import {extname, isAbsolute, relative, resolve} from "node:path";

/** Resolves bundled assets and SPA routes without allowing requests outside the web bundle. */
export function resolveRendererFile(root: string, requestUrl: string): string | undefined {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== "supernova:" || url.hostname !== "app") return;
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes("\\") || pathname.includes("\0")) return;
    const file = resolve(root, `.${pathname}`);
    const path = relative(root, file);
    if (path.startsWith("..") || isAbsolute(path)) return;
    return extname(path) ? file : resolve(root, "index.html");
  } catch {
    return;
  }
}
