import {spawn} from "node:child_process";
import {accessSync, constants} from "node:fs";
import {homedir} from "node:os";
import {delimiter, isAbsolute, join} from "node:path";
import type {DesktopEditor, DesktopEditorId} from "@supernova/contracts/lib/desktop";

interface EditorDefinition extends DesktopEditor {
  readonly commands: readonly string[];
  readonly macApp: string;
  readonly windowsPaths: readonly (readonly [variable: string, path: string])[];
}

const EDITORS: readonly EditorDefinition[] = [
  {
    id: "vscode",
    label: "VS Code",
    commands: ["code"],
    macApp: "Visual Studio Code",
    windowsPaths: [
      ["LOCALAPPDATA", "Programs/Microsoft VS Code/Code.exe"],
      ["ProgramFiles", "Microsoft VS Code/Code.exe"],
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    commands: ["cursor"],
    macApp: "Cursor",
    windowsPaths: [
      ["LOCALAPPDATA", "Programs/cursor/Cursor.exe"],
      ["ProgramFiles", "Cursor/Cursor.exe"],
    ],
  },
  {
    id: "zed",
    label: "Zed",
    // Some Linux packages install Zed as `zeditor`.
    commands: ["zed", "zeditor"],
    macApp: "Zed",
    windowsPaths: [["LOCALAPPDATA", "Programs/Zed/Zed.exe"]],
  },
];

export interface EditorHost {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly exists: (path: string) => boolean;
}

interface EditorLaunch {
  readonly command: string;
  readonly args: readonly string[];
}

function defaultHost(): EditorHost {
  return {
    platform: process.platform,
    env: process.env,
    home: homedir(),
    exists: (path) => {
      try {
        accessSync(path, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** PATH first so the user's install wins. Windows skips PATH: editors put `.cmd` shims there, which need a shell. */
function resolveEditorLaunch(editor: EditorDefinition, host: EditorHost): EditorLaunch | undefined {
  if (host.platform === "win32") {
    for (const [variable, path] of editor.windowsPaths) {
      const root = host.env[variable];
      if (root && host.exists(join(root, path))) return {command: join(root, path), args: []};
    }
    return undefined;
  }

  const directories = (host.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const command of editor.commands) {
    const found = directories.map((directory) => join(directory, command)).find(host.exists);
    if (found) return {command: found, args: []};
  }

  if (host.platform === "darwin") {
    for (const root of [join(host.home, "Applications"), "/Applications"]) {
      const bundle = join(root, `${editor.macApp}.app`);
      if (host.exists(bundle)) return {command: "open", args: ["-a", bundle]};
    }
  }

  return undefined;
}

export function listEditors(host: EditorHost = defaultHost()): DesktopEditor[] {
  return EDITORS.filter((editor) => resolveEditorLaunch(editor, host)).map(({id, label}) => ({id, label}));
}

export async function openInEditor(id: unknown, path: unknown, host: EditorHost = defaultHost()): Promise<void> {
  const editor = EDITORS.find((candidate) => candidate.id === (id as DesktopEditorId));
  if (!editor) throw new Error("Unknown editor.");
  if (typeof path !== "string" || !isAbsolute(path)) throw new Error("An absolute directory path is required.");

  const launch = resolveEditorLaunch(editor, host);
  if (!launch) throw new Error(`${editor.label} is not installed.`);

  // No shell, so the path reaches the editor as one argument whatever it contains.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.command, [...launch.args, path], {detached: true, stdio: "ignore"});
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
