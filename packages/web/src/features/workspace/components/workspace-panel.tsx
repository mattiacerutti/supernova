import {AnimatePresence, motion} from "framer-motion";
import {Activity, useRef} from "react";
import type {ReactNode} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu, {MenuItem} from "@/components/ui/menu";
import FileIcon from "@/features/workspace/components/file-tree/file-icon";
import ChangesTab from "@/features/workspace/tabs/changes-tab";
import FilesTab from "@/features/workspace/tabs/files-tab";
import {MOCK_WORKSPACE, mockCommitChanges} from "@/features/workspace/lib/mock-workspace";
import {minWorkspacePanelWidth} from "@/features/workspace/lib/workspace-panel-width";
import {tabKind, useWorkspacePanelStore, WORKSPACE_TAB_KINDS} from "@/features/workspace/stores/workspace-panel-store";
import type {WorkspacePanelTab, WorkspacePanelTabKind} from "@/features/workspace/types/workspace-panel";
import {useDragResize} from "@/hooks/use-drag-resize";
import type {AppEnvironment} from "@/lib/app-environment";
import {cn} from "@/lib/cn";
import {clampedPanelWidth, maxPanelWidth} from "@/lib/panel-layout";

const WORKSPACE_TAB_KIND_NAMES = Object.keys(WORKSPACE_TAB_KINDS) as readonly WorkspacePanelTabKind[];

function renderTab(tab: WorkspacePanelTab): ReactNode {
  switch (tab.kind) {
    case "changes":
      return <ChangesTab getCommitChanges={mockCommitChanges} snapshot={MOCK_WORKSPACE} tab={tab} />;
    case "files":
      return <FilesTab files={MOCK_WORKSPACE.files} tab={tab} />;
  }
}

interface PanelTabProps {
  readonly active: boolean;
  readonly onActivate: () => void;
  readonly onClose: () => void;
  readonly onPin: () => void;
  readonly tab: WorkspacePanelTab;
}

function PanelTab(props: PanelTabProps) {
  const {active, onActivate, onClose, onPin, tab} = props;
  const {icon, label, preview} = tabKind(tab).present(tab);

  return (
    <div
      className={cn(
        // Mirrors Button's primary variant; a div because the tab holds two buttons.
        "group/tab relative flex h-7 min-w-0 shrink-0 items-center rounded-xl text-sm text-ink-muted corner-superellipse/1.3 hover:bg-overlay-hover hover:text-ink-strong",
        active && "bg-overlay-pressed text-ink-strong"
      )}
    >
      <Button aria-label={`Close ${label}`} className="group/close relative grid h-full shrink-0 place-items-center pl-2" onClick={onClose}>
        {typeof icon === "string" ? (
          <Icon className="col-start-1 row-start-1 transition-opacity duration-160 ease-out group-focus-visible/close:opacity-0 group-hover/tab:opacity-0" name={icon} size="xs" />
        ) : (
          <FileIcon className="col-start-1 row-start-1 transition-opacity duration-160 ease-out group-focus-visible/close:opacity-0 group-hover/tab:opacity-0" path={icon.file} />
        )}
        <Icon
          className="col-start-1 row-start-1 opacity-0 transition-opacity duration-160 ease-out hover:text-ink-strong group-focus-visible/close:opacity-100 group-hover/tab:opacity-100"
          name="x"
          size="xs"
        />
      </Button>
      <Button
        aria-selected={active}
        className="flex h-full min-w-0 max-w-40 flex-1 items-center pl-1.5 pr-2"
        onClick={onActivate}
        onDoubleClick={onPin}
        role="tab"
        title={preview ? `${label} (preview, double-click to keep)` : label}
      >
        <span className={cn("truncate", preview && "italic")}>{label}</span>
      </Button>
    </div>
  );
}

function WorkspacePanelContent() {
  const activeTabId = useWorkspacePanelStore((state) => state.activeTabId);
  const tabs = useWorkspacePanelStore((state) => state.tabs);
  const closeTab = useWorkspacePanelStore((state) => state.closeTab);
  const openTab = useWorkspacePanelStore((state) => state.openTab);
  const pinTab = useWorkspacePanelStore((state) => state.pinTab);
  const setActiveTab = useWorkspacePanelStore((state) => state.setActiveTab);

  const addableKinds = WORKSPACE_TAB_KIND_NAMES.filter((kind) => !(WORKSPACE_TAB_KINDS[kind].singleton && tabs.some((tab) => tab.kind === kind)));

  return (
    <section aria-label="Project workspace" className="flex h-full min-h-0 w-full flex-col bg-surface">
      {/* Right padding clears the floating workspace toggle. */}
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-1 pl-2 pr-[calc(--spacing(11)+var(--window-controls-right-inset))]">
        {/* Outside the titlebar drag region, or the gaps between tabs swallow wheel events. */}
        <div aria-label="Workspace tabs" className="no-scrollbar scroll-fade-x flex h-full min-w-0 flex-1 items-center overflow-x-auto [-webkit-app-region:no-drag]" role="tablist">
          <AnimatePresence initial={false}>
            {tabs.map((tab) => (
              <motion.div
                animate={{marginRight: 4, opacity: 1, width: "auto"}}
                className="shrink-0 overflow-hidden"
                exit={{marginRight: 0, opacity: 0, width: 0}}
                initial={{marginRight: 0, opacity: 0, width: 0}}
                key={tab.id}
                transition={{duration: 0.2, ease: "easeOut"}}
              >
                <PanelTab active={tab.id === activeTabId} onActivate={() => setActiveTab(tab.id)} onClose={() => closeTab(tab.id)} onPin={() => pinTab(tab.id)} tab={tab} />
              </motion.div>
            ))}
          </AnimatePresence>
          <Menu
            align="start"
            trigger={(triggerProps) => (
              <IconButton {...triggerProps} className="size-7 shrink-0 text-ink-muted" label="Open a workspace view" variant="primary">
                <Icon name="plus" size="sm" />
              </IconButton>
            )}
            triggerLabel="Open a workspace view"
            sideOffset={4}
          >
            {addableKinds.map((kind) => (
              <MenuItem icon={<Icon name={WORKSPACE_TAB_KINDS[kind].icon} size="xs" />} key={kind} onClick={() => openTab(kind)}>
                {WORKSPACE_TAB_KINDS[kind].label}
              </MenuItem>
            ))}
          </Menu>
        </div>
      </header>

      {tabs.length === 0 && (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="px-6 text-center text-sm text-ink-faint">Open a view with the + button above.</p>
        </div>
      )}
      {/* Hidden tabs stay mounted so their local state survives switching. */}
      {tabs.map((tab) => (
        <Activity key={tab.id} mode={tab.id === activeTabId ? "visible" : "hidden"}>
          {renderTab(tab)}
        </Activity>
      ))}
    </section>
  );
}

interface WorkspacePanelProps {
  readonly appEnvironment: AppEnvironment;
}

export default function WorkspacePanel(props: WorkspacePanelProps) {
  const {appEnvironment} = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const open = useWorkspacePanelStore((state) => state.open);
  const storedWidth = useWorkspacePanelStore((state) => state.width);
  const setWidth = useWorkspacePanelStore((state) => state.setWidth);

  const minWidth = minWorkspacePanelWidth(appEnvironment);
  const width = Math.max(storedWidth, minWidth);
  const panelWidth = clampedPanelWidth(width, minWidth);
  const handlePointerDown = useDragResize((_, deltaX) => {
    const rowWidth = panelRef.current?.parentElement?.clientWidth ?? window.innerWidth;
    setWidth(width - deltaX, minWidth, maxPanelWidth(rowWidth, minWidth));
  });

  return (
    <div
      className={cn(
        "relative h-full shrink-0 overflow-hidden transition-[width] duration-250 ease-in-out [[data-resizing]_&]:transition-none [[data-resizing]_&]:duration-0",
        open && "border-l border-border-muted"
      )}
      inert={!open}
      ref={panelRef}
      style={{width: open ? panelWidth : 0}}
    >
      <div className="h-full" style={{width: panelWidth}}>
        <WorkspacePanelContent />
      </div>
      {open && (
        <div
          aria-label="Resize workspace panel"
          aria-orientation="vertical"
          className="absolute inset-y-0 left-0 w-1 cursor-col-resize"
          onPointerDown={handlePointerDown}
          role="separator"
        />
      )}
    </div>
  );
}
