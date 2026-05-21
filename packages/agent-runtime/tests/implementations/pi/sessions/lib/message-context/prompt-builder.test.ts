import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {buildPrompt} from "@supernova/agent-runtime/implementations/pi/sessions/lib/message-context/prompt-builder";

describe("building Pi user prompts", () => {
  it("renders text and references into the authored prompt", async () => {
    await expect(
      buildPrompt({
        contentParts: [
          {text: "Read ", type: "text"},
          {id: "ref-1", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
          {text: " with ", type: "text"},
          {id: "ref-2", kind: "skill", name: "Demo Skill", type: "reference", value: "missing-skill"},
        ],
        projectPath: process.cwd(),
      })
    ).resolves.toBe("Read @src/file.ts with missing-skill");
  });

  it("appends selected skill contents once", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "supernova-prompt-skill-"));
    const skillDir = join(projectPath, ".agents", "skills", "demo");
    await mkdir(skillDir, {recursive: true});
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: demo skill\n---\n\nUse cobalt.\n");

    const prompt = await buildPrompt({
      contentParts: [
        {text: "Use ", type: "text"},
        {id: "skill-1", kind: "skill", name: "Demo", type: "reference", value: "demo"},
        {text: " and ", type: "text"},
        {id: "skill-2", kind: "skill", name: "Demo again", type: "reference", value: "demo"},
      ],
      projectPath,
    });

    expect(prompt).toBe(
      ["Use demo and demo", `<skill>\n<name>demo</name>\n<path>${join(skillDir, "SKILL.md")}</path>\n---\nname: demo\ndescription: demo skill\n---\n\nUse cobalt.\n</skill>`].join(
        "\n\n"
      )
    );
  });

  it("appends text attachments as escaped attachment blocks", async () => {
    const prompt = await buildPrompt({
      contentParts: [
        {text: "Use notes", type: "text"},
        {
          contentBase64: Buffer.from("Use <tag> & 'quote'").toString("base64"),
          id: "text-1",
          kind: "text",
          mime: "text/plain",
          name: "a&b<'\".txt",
          size: 10,
          type: "attachment",
        },
      ],
      projectPath: process.cwd(),
    });

    expect(prompt).toBe(
      'Use notes\n\n<attachment id="text-1" name="a&amp;b&lt;&apos;&quot;.txt" mime="text/plain" size="10">\nUse &lt;tag&gt; &amp; &apos;quote&apos;\n</attachment>'
    );
  });

  it("does not append image attachments to text prompt content", async () => {
    await expect(
      buildPrompt({
        contentParts: [
          {text: "Review", type: "text"},
          {contentBase64: "aW1hZ2U=", id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"},
        ],
        projectPath: process.cwd(),
      })
    ).resolves.toBe("Review");
  });
});
