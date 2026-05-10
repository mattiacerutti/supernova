export interface IStreamingMessageSegment {
  mode: "markdown" | "text";
  text: string;
}

function findOpenFenceStart(text: string): number | undefined {
  const lines = text.split("\n");
  let offset = 0;
  let open: {char: string; size: number; start: number} | undefined;

  for (const line of lines) {
    // Markdown fences may be indented up to three spaces. Track the exact
    // marker so longer fences can contain shorter ones without closing early.
    const match = line.match(/^[\t ]{0,3}(`{3,}|~{3,})/);
    if (match?.[1]) {
      const mark = match[1];
      if (!open) {
        open = {char: mark[0] ?? "`", size: mark.length, start: offset};
      } else if (mark[0] === open.char && mark.length >= open.size) {
        open = undefined;
      }
    }
    offset += line.length + 1;
  }

  return open?.start;
}

export function segmentStreamingMessage(text: string): IStreamingMessageSegment[] {
  if (!text) return [];

  // An unfinished fenced block is the most unstable Markdown shape while
  // streaming: reparsing it on every token causes layout churn and repeated
  // highlighter work. Keep the open fence and everything after it as text.
  const openFenceStart = findOpenFenceStart(text);
  if (openFenceStart !== undefined) {
    const head = text.slice(0, openFenceStart);
    const tail = text.slice(openFenceStart);
    return [...(head.trim().length > 0 ? [{mode: "markdown" as const, text: head}] : []), {mode: "text", text: tail}];
  }

  // Outside code fences, only promote complete paragraphs to Markdown. The
  // trailing paragraph is still changing token-by-token, so render it as text
  // until a blank-line boundary makes it stable.
  const boundary = text.lastIndexOf("\n\n");
  if (boundary === -1) return [{mode: "text", text}];

  const head = text.slice(0, boundary + 2);
  const tail = text.slice(boundary + 2);
  return [...(head.trim().length > 0 ? [{mode: "markdown" as const, text: head}] : []), ...(tail.length > 0 ? [{mode: "text" as const, text: tail}] : [])];
}
