import type {ReactNode} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";

interface SessionComposerShellProps {
  readonly attachmentDisabled: boolean;
  readonly children: ReactNode;
  readonly controls: ReactNode;
  readonly primaryAction: ReactNode;
}

export default function SessionComposerShell(props: SessionComposerShellProps) {
  const {attachmentDisabled, children, controls, primaryAction} = props;

  return (
    <div className="px-4 pb-4 md:px-6">
      <div className="mx-auto max-w-3xl rounded-3xl corner-superellipse/1.3 bg-[#2b2b2b] px-3 py-2 ring-1 ring-white/6 shadow-md">
        {children}

        <div className="flex items-center justify-between gap-2">
          <IconButton
            label="Attach files"
            className="grid size-8 place-items-center rounded-full text-neutral-400 transition hover:bg-white/6 hover:text-neutral-100 disabled:cursor-default disabled:text-neutral-600 disabled:hover:bg-transparent"
            disabled={attachmentDisabled}
            size="none"
            variant="ghost"
          >
            <Icon name="plus" size="sm" />
          </IconButton>

          <div className="flex min-w-0 items-center gap-4">
            {controls}
            {primaryAction}
          </div>
        </div>
      </div>
    </div>
  );
}
