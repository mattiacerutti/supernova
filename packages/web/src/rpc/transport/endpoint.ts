/** Converts an explicit HTTP API endpoint to its RPC transport URL, independently of UI hosting. */
export function resolveSocketUrl(endpoint: string): string {
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("The server endpoint must be an HTTP(S) URL without credentials.");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
  url.search = "";
  url.hash = "";
  return url.href;
}
