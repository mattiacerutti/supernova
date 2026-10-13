import {useState} from "react";
import {matchSorter} from "match-sorter";
import type {DesktopApi, DesktopEditorId} from "@supernova/contracts/lib/desktop";
import type {IconName} from "@/components/ui/icon";
import {appEnvironment} from "@/config/app-environment";
import CommandPaletteItem from "@/features/command-palette/components/command-palette-item";
import CommandPaletteList from "@/features/command-palette/components/command-palette-list";
import {useInstalledEditors} from "@/features/sessions/hooks/command-palette/use-installed-editors";
import {showToast} from "@/lib/toast";

const FILE_MANAGER_NAME = appEnvironment === "mac" ? "Finder" : appEnvironment === "windows" ? "File Explorer" : "File Manager";

interface OpenInTarget {
  readonly id: DesktopEditorId | "file-manager";
  readonly label: string;
  readonly icon: IconName;
}

/** Electron prefixes errors from the main process with the channel name; the user only needs the reason after it. */
function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

interface OpenSessionInPageProps {
  readonly desktopApi: DesktopApi;
  readonly onBack: () => void;
  readonly onClose: () => void;
  /** The directory to open, on this machine. */
  readonly path: string;
}

/** The palette page that opens a session's directory in an installed editor or the file manager. */
export default function OpenSessionInPage(props: OpenSessionInPageProps) {
  const {desktopApi, onBack, onClose, path} = props;
  const [query, setQuery] = useState("");
  const editors = useInstalledEditors();

  // The file manager joins the editors once they load, so the list does not reorder under the highlight. A failed
  // lookup still offers the file manager rather than an empty page.
  const installed = editors.isError ? [] : editors.data;
  const targets: OpenInTarget[] = installed
    ? [...installed.map((editor) => ({...editor, icon: "code" as const})), {id: "file-manager", label: FILE_MANAGER_NAME, icon: "folder-open"}]
    : [];
  const trimmedQuery = query.trim();
  const matchedTargets = trimmedQuery.length === 0 ? targets : matchSorter(targets, trimmedQuery, {keys: ["label"]});

  const handleSelect = (target: OpenInTarget): void => {
    onClose();
    const opening = target.id === "file-manager" ? desktopApi.openDirectory(path) : desktopApi.openInEditor(target.id, path);
    opening.catch((error: unknown) => showToast(`Couldn't open ${target.label}`, errorMessage(error)));
  };

  return (
    <CommandPaletteList
      getRowKey={(target: OpenInTarget) => target.id}
      hints={[{hotkeys: ["Enter"], label: "Open"}]}
      onBack={onBack}
      onQueryChange={setQuery}
      onSelect={handleSelect}
      placeholder="Open session in…"
      query={query}
      renderRow={(target, itemState) => (
        <CommandPaletteItem {...itemState} icon={target.icon}>
          {target.label}
        </CommandPaletteItem>
      )}
      rows={matchedTargets}
      status={installed && matchedTargets.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">No matching apps.</p>}
    />
  );
}
