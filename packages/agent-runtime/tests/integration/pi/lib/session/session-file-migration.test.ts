import {copyFileSync, mkdirSync, mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, sep} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {afterEach, describe, expect, it} from "vitest";
import {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import {cleanupTempDirs} from "@tests/support/async";
import {assistantTexts, createPiTestRuntime, fauxAssistantMessage, selectedModelReference, turnContents} from "@tests/support/session-runtime";

/** A session file Supernova wrote on Pi 1.2.0: one answered turn and its turn record (`tests/support/fixtures`). */
const FIXTURE = join(import.meta.dirname, "../../../../support/fixtures/pi-1.2.0-session.sqlite");
const SESSION_ID = "fixture-1";

describe("a session file from Pi 1.2.0", () => {
  const tempDirs: string[] = [];
  const runtimes: Array<{unregister: () => Promise<void>}> = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
    cleanupTempDirs(tempDirs);
  });

  /** A copy of the fixture under a fresh sessions root, with its catalog record: the fixture itself stays untouched. */
  async function migrated() {
    const root = mkdtempSync(join(tmpdir(), "supernova-migration-"));
    tempDirs.push(root);
    const projectPath = mkdtempSync(join(tmpdir(), "supernova-migration-project-")).split(sep).join("/");
    tempDirs.push(projectPath);
    mkdirSync(join(root, SESSION_ID));
    copyFileSync(FIXTURE, join(root, SESSION_ID, "session.sqlite"));
    const catalog = await SessionCatalog.open(join(root, "catalog.sqlite"));
    const now = new Date().toISOString();
    catalog.insert({id: SESSION_ID, projectPath, title: "Old session", pinned: false, createdAt: now, updatedAt: now});
    catalog.close();
    const pi = await createPiTestRuntime({sessionStorageRoot: root});
    runtimes.push(pi);
    return {pi, root, projectPath};
  }

  it("migrates on open, keeps its history and turns, and continues from them", async () => {
    const {pi, root, projectPath} = await migrated();

    const session = await pi.sessions.get({sessionId: SESSION_ID});
    expect(session).toMatchObject({id: SESSION_ID});
    expect(await pi.sessions.record({sessionId: SESSION_ID})).toMatchObject({title: "Old session", projectPath});
    expect(turnContents(session)).toEqual([[{type: "text", text: "Old question"}]]);
    expect(assistantTexts(session)).toEqual(["Old answer"]);
    // The listing has it, as before the upgrade.
    expect((await pi.list(projectPath, 5)).map((listed) => listed.id)).toEqual([SESSION_ID]);

    pi.faux.setResponses([fauxAssistantMessage("New answer")]);
    const {session: continued} = await pi.sendMessage({message: "New question", modelReference: selectedModelReference, sessionId: SESSION_ID, captureCheckpoints: false});
    expect(turnContents(continued)).toEqual([[{type: "text", text: "Old question"}], [{type: "text", text: "New question"}]]);
    expect(assistantTexts(continued)).toEqual(["Old answer", "New answer"]);

    // Opening it upgraded its storage schema: Pi 1.3 and earlier cannot open it again (one-way, as the release notes say).
    await pi.sessionRuntime.release({sessionId: SESSION_ID, workspacePath: projectPath});
    const schemaVersion = (path: string) => {
      const database = new DatabaseSync(path, {readOnly: true});
      try {
        return Object.values(database.prepare("SELECT * FROM durable_schema").get() ?? {});
      } finally {
        database.close();
      }
    };
    // The fixture is never opened in place (that would leave SQLite's sidecar files beside it); an untouched copy is.
    const untouched = join(root, "untouched.sqlite");
    copyFileSync(FIXTURE, untouched);
    expect(schemaVersion(untouched)).toEqual([1, 1]);
    expect(schemaVersion(join(root, SESSION_ID, "session.sqlite"))).not.toEqual([1, 1]);
  });

  it("can be undone to before its imported turn", async () => {
    const {pi} = await migrated();
    await pi.sessions.get({sessionId: SESSION_ID});

    await pi.sessionRuntime.undoCheckpoint({sessionId: SESSION_ID});

    const session = await pi.sessionRuntime.current(SESSION_ID);
    expect(turnContents(session)).toEqual([]);
    expect(turnContents({entries: session.undone})).toEqual([[{type: "text", text: "Old question"}]]);
  });
});
