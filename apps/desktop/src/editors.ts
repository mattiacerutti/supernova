import {spawn} from "node:child_process";
import {accessSync, constants} from "node:fs";
import {homedir} from "node:os";
import {delimiter, isAbsolute, join} from "node:path";
import type {DesktopEditor, DesktopEditorId} from "@supernova/contracts/lib/desktop";

interface EditorDefinition extends DesktopEditor {
  /** Commands looked up on PATH, outside Windows. */
  readonly commands: readonly string[];
  /** The app bundle's name on macOS, looked up in the user's and the system's Applications folders. */
  readonly macApp: string;
  /** Executables on Windows, relative to the folder an environment variable names. */
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

/** What editor discovery reads from the machine; tests pass their own. */
export interface EditorHost {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  /** Whether `path` exists and, for files, can be executed. */
  readonly exists: (path: string) => boolean;
}

/** The program to run and the arguments that come before the directory to open. */
export interface EditorLaunch {
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

/**
 * How to start `editor` on this machine, or undefined when it is not installed. PATH comes first, so the user's own
 * install wins; on macOS an app bundle without its command installed still counts. Windows skips PATH because the
 * editors put `.cmd` shims there, which only run through a shell and would need the path quoted for it.
 */
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

/** The editors installed on this machine, in display order. Checked on every call, so new installs show up. */
export function listEditors(host: EditorHost = defaultHost()): DesktopEditor[] {
  return EDITORS.filter((editor) => resolveEditorLaunch(editor, host)).map(({id, label}) => ({id, label}));
}

/** Opens `path` as a window of the editor `id`. Both come from the renderer, so both are checked. */
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
