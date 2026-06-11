import {describe, expect, it} from "vitest";
import {parseFileEditPatch} from "@/features/sessions/lib/diff/diff-rendering";

const validPatch = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-const label = "old";
+const label = "new";
 export {label};
`;

describe("diff rendering", () => {
  it("parses valid file edit patches", () => {
    const fileDiff = parseFileEditPatch({patch: validPatch, path: "src/app.ts"});

    expect(fileDiff).toMatchObject({name: "src/app.ts", type: "change"});
    expect(fileDiff?.additionLines.length).toBeGreaterThan(0);
    expect(fileDiff?.deletionLines.length).toBeGreaterThan(0);
  });

  it("returns undefined for invalid patches without throwing", () => {
    const input = {patch: "not a unified patch", path: "src/app.ts"};

    expect(parseFileEditPatch(input)).toBeUndefined();
    expect(parseFileEditPatch(input)).toBeUndefined();
  });
});
