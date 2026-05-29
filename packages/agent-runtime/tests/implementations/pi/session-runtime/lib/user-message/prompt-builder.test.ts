import {describe, expect, it} from "vitest";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-resource-catalog";
import {buildPrompt} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/user-message/prompt-builder";

const skillFile = "/skills/demo/SKILL.md";

function resourceCatalog(input?: {skillContent?: string}): PiResourceCatalogShape {
  return {
    listPromptTemplates: async () => [],
    listSkills: async () =>
      input?.skillContent
        ? [
            {
              baseDir: "/skills/demo",
              description: "demo skill",
              disableModelInvocation: false,
              filePath: skillFile,
              name: "demo",
              sourceInfo: {origin: "top-level", path: skillFile, scope: "project", source: "test"},
            },
          ]
        : [],
    readSkillContent: async () => input?.skillContent ?? "",
  };
}

describe("building Pi prompts from authored content", () => {
  it("renders text and references as the prompt visible to the model", async () => {
    await expect(
      buildPrompt({
        contentParts: [
          {text: "Read ", type: "text"},
          {id: "file", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
        ],
        projectPath: process.cwd(),
        resourceCatalog: resourceCatalog(),
      })
    ).resolves.toBe("Read @src/file.ts");
  });

  it("appends each selected skill once", async () => {
    const prompt = await buildPrompt({
      contentParts: [
        {text: "Use ", type: "text"},
        {id: "skill-1", kind: "skill", name: "Demo", type: "reference", value: "demo"},
        {text: " twice ", type: "text"},
        {id: "skill-2", kind: "skill", name: "Demo again", type: "reference", value: "demo"},
      ],
      projectPath: "/workspace",
      resourceCatalog: resourceCatalog({skillContent: "---\nname: demo\ndescription: demo skill\n---\n\nUse cobalt.\n"}),
    });

    expect(prompt).toBe(
      ["Use demo twice demo", `<skill>\n<name>demo</name>\n<path>${skillFile}</path>\n---\nname: demo\ndescription: demo skill\n---\n\nUse cobalt.\n</skill>`].join("\n\n")
    );
  });

  it("appends escaped text attachment content but keeps image attachments out of the text prompt", async () => {
    const prompt = await buildPrompt({
      contentParts: [
        {text: "Use notes", type: "text"},
        {contentBase64: Buffer.from("Use <tag> & 'quote'").toString("base64"), id: "text-1", kind: "text", mime: "text/plain", name: "a&b<'\".txt", size: 10, type: "attachment"},
        {contentBase64: "aW1hZ2U=", id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"},
      ],
      projectPath: process.cwd(),
      resourceCatalog: resourceCatalog(),
    });

    expect(prompt).toBe(
      'Use notes\n\n<attachment id="text-1" name="a&amp;b&lt;&apos;&quot;.txt" mime="text/plain" size="10">\nUse &lt;tag&gt; &amp; &apos;quote&apos;\n</attachment>'
    );
  });
});
