import {execFile} from "node:child_process";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {promisify} from "node:util";
import {randomUUID} from "node:crypto";
import {dirname, join} from "node:path";
import {expect, test as base} from "@playwright/test";
import {App} from "@tests/e2e/harness/app";
import type {Project} from "@tests/e2e/harness/app";
import type {ScriptedModel} from "@tests/e2e/harness/model-server";
import {startSupernova} from "@tests/e2e/harness/supernova";
import type {Supernova} from "@tests/e2e/harness/supernova";

const execFileAsync = promisify(execFile);
const GIT_ENV = {...process.env, GIT_AUTHOR_NAME: "E2E", GIT_AUTHOR_EMAIL: "e2e@example.com", GIT_COMMITTER_NAME: "E2E", GIT_COMMITTER_EMAIL: "e2e@example.com"};

interface Skill {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
}

interface Fixtures {
  readonly app: App;
  readonly model: ScriptedModel;
  readonly project: {readonly project: Project; readonly read: (file: string) => Promise<string | undefined>; readonly git: (...args: string[]) => Promise<void>};
  readonly projectFiles: Readonly<Record<string, string>>;
  readonly projectGit: boolean;
  readonly projectSkills: readonly Skill[];
}

export const test = base.extend<Fixtures, {readonly supernova: Supernova}>({
  projectFiles: [{}, {option: true}],
  projectGit: [false, {option: true}],
  projectSkills: [[], {option: true}],

  supernova: [
    async ({}, use) => {
      const supernova = await startSupernova();
      await use(supernova);
      await supernova.stop();
    },
    {scope: "worker", timeout: 60_000},
  ],

  baseURL: async ({supernova}, use) => use(supernova.baseURL),

  // Automatic, so a test that never scripts the model still fails when the app calls it.
  model: [
    async ({supernova}, use, testInfo) => {
      await use(supernova.model);
      const problems = supernova.model.reset();
      if (testInfo.status === testInfo.expectedStatus && problems.length > 0) throw new Error(problems.join("\n"));
    },
    {auto: true},
  ],

  app: async ({page, supernova}, use, testInfo) => {
    await use(new App(page));
    if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach("server.log", {body: supernova.logs(), contentType: "text/plain"});
  },

  project: [
    async ({app, projectFiles, projectGit, projectSkills, supernova}, use) => {
      const path = join(supernova.projectsRoot, `project-${randomUUID().slice(0, 8)}`);
      const skills = projectSkills.map((skill) => [
        `.agents/skills/${skill.name}/SKILL.md`,
        `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.instructions}\n`,
      ]);
      for (const [file, content] of [...Object.entries(projectFiles), ...skills]) {
        await mkdir(dirname(join(path, file!)), {recursive: true});
        await writeFile(join(path, file!), content!);
      }
      await mkdir(path, {recursive: true});
      const git = async (...args: string[]) => void (await execFileAsync("git", args, {cwd: path, env: GIT_ENV}));
      if (projectGit) {
        await git("init", "-q", "-b", "main");
        await git("add", "-A");
        await git("commit", "-q", "--allow-empty", "-m", "initial");
      }
      const project = await app.openProject(path);
      await use({project, git, read: (file) => readFile(join(path, file), "utf8").catch(() => undefined)});
    },
    {auto: true},
  ],
});

export {expect};
