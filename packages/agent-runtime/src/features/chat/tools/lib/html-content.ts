import {Parser} from "htmlparser2";
import TurndownService from "turndown";

const skippedTextTags = new Set(["script", "style", "noscript", "iframe", "object", "embed"]);

export function extractTextFromHtml(html: string): string {
  let text = "";
  let skipDepth = 0;

  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || skippedTextTags.has(name)) {
        skipDepth++;
      }
    },
    ontext(input) {
      if (skipDepth === 0) {
        text += input;
      }
    },
    onclosetag() {
      if (skipDepth > 0) {
        skipDepth--;
      }
    },
  });

  parser.write(html);
  parser.end();

  return text.trim();
}

export function convertHtmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
    hr: "---",
  });

  turndown.remove(["script", "style", "meta", "link"]);

  return turndown.turndown(html);
}
