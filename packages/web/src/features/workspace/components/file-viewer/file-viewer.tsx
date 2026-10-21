import {WorkerPoolContext} from "@pierre/diffs/react";
import {Fragment, useState} from "react";
import type {ReactNode} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import {cn} from "@/lib/cn";
import {diffWorkerPool} from "@/lib/diffs/worker-pool";
import {useSettingsStore} from "@/stores/settings-store";

interface PathBreadcrumbProps {
  readonly deleted: boolean;
  readonly path: string;
}

function PathBreadcrumb(props: PathBreadcrumbProps) {
  const {deleted, path} = props;
  const segments = path.split("/");
  const lastIndex = segments.length - 1;

  return (
    <nav
      aria-label="File path"
      className="no-scrollbar scroll-fade-x flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap"
      key={path}
      ref={(node) => {
        if (node) node.scrollLeft = node.scrollWidth;
      }}
    >
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {index > 0 && <Icon aria-hidden="true" className="shrink-0 text-ink-faint" name="chevron-right" size="xs" />}
          <span className={cn(index === lastIndex ? "text-ink" : "text-ink-faint", index === lastIndex && deleted && "line-through")}>{segment}</span>
        </Fragment>
      ))}
    </nav>
  );
}

interface FileViewerProps {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly deleted?: boolean;
  readonly explorer: ReactNode;
  readonly path: string | null;
}

export default function FileViewer(props: FileViewerProps) {
  const {actions, children, deleted = false, explorer, path} = props;
  const [explorerVisible, setExplorerVisible] = useState(true);
  const mode = useSettingsStore((state) => state.resolvedMode);

  const hasFile = path !== null;
  const showExplorer = !hasFile || explorerVisible;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasFile && (
        <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border-muted px-3 text-sm">
          <div className="flex min-w-0 items-center">
            <PathBreadcrumb deleted={deleted} path={path} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <IconButton
              className={cn("size-7 text-ink-muted", explorerVisible && "bg-overlay-hover text-ink")}
              label={explorerVisible ? "Hide explorer" : "Show explorer"}
              onClick={() => setExplorerVisible((visible) => !visible)}
              variant="primary"
            >
              <Icon name="folders" size="sm" />
            </IconButton>
          </div>
        </header>
      )}

      <div className="@container flex min-h-0 flex-1">
        {hasFile && (
          // Without the pool in context, Pierre tokenizes every opened file and diff on the main thread.
          <WorkerPoolContext value={diffWorkerPool(mode)}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
          </WorkerPoolContext>
        )}
        <div
          className={cn(
            "min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
            !hasFile ? "w-full" : showExplorer ? "w-[min(20rem,48%)] border-l border-border-muted" : "w-0"
          )}
          inert={!showExplorer}
        >
          <div className={cn("flex h-full min-h-0 flex-col", hasFile ? "w-[min(20rem,48cqw)]" : "w-full")}>{explorer}</div>
        </div>
      </div>
    </div>
  );
}
