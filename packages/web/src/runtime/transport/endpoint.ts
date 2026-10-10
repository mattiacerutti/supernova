/** Converts an explicit HTTP API endpoint to the URL of one of its WebSockets (the runtime socket by default), independently of UI hosting. */
export function resolveSocketUrl(endpoint: string, path = "/ws"): string {
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("The server endpoint must be an HTTP(S) URL without credentials.");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url.href;
}
