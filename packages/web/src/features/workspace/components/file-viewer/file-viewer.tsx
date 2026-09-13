import {Fragment, useState} from "react";
import type {ReactNode} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import {cn} from "@/lib/cn";

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
  /** Header metadata and actions shown before the explorer toggle. */
  readonly actions?: ReactNode;
  /** The opened file or diff. */
  readonly children: ReactNode;
  readonly deleted?: boolean;
  /** The tree or change list. Fills the panel until a file opens, then sits beside it. */
  readonly explorer: ReactNode;
  /** Path of the opened file, or null while only the explorer shows. */
  readonly path: string | null;
}

export default function FileViewer(props: FileViewerProps) {
  const {actions, children, deleted = false, explorer, path} = props;
  const [explorerVisible, setExplorerVisible] = useState(true);

  if (path === null) return <div className="flex min-h-0 flex-1 flex-col">{explorer}</div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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

      <div className="@container flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        <div
          className={cn("min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out", explorerVisible ? "w-[min(20rem,48%)] border-l border-border-muted" : "w-0")}
          inert={!explorerVisible}
        >
          <div className="flex h-full w-[min(20rem,48cqw)] min-h-0 flex-col">{explorer}</div>
        </div>
      </div>
    </div>
  );
}
