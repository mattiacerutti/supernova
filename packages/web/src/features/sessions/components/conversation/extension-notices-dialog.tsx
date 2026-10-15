import {useState} from "react";
import Dialog from "@/components/ui/dialog";
import {onOpenExtensionNotices} from "@/features/sessions/lib/session-notices";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useMountEffect} from "@/hooks/use-mount-effect";

/** The extension's file or package name, without the path to it. */
function extensionName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  const last = segments.at(-1) ?? path;
  // A package's entry file says nothing; its folder is the name.
  return /^index\.[cm]?[jt]s$/.test(last) ? (segments.at(-2) ?? last) : last;
}

/** What a session's extensions could not do here, by extension. Mounted once; the extension notice toast opens it. */
export default function ExtensionNoticesDialog() {
  // The session stays set while the dialog closes, so its content does not vanish mid-animation.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const notices = useSessionsStore((state) => (sessionId === null ? undefined : state.entries[sessionId]?.notices));

  useMountEffect(() =>
    onOpenExtensionNotices((id) => {
      setSessionId(id);
      setOpen(true);
    })
  );

  const byExtension = new Map<string, {name: string; messages: string[]}>();
  for (const notice of notices ?? []) {
    if (notice.extensionPath === undefined) continue;
    const group = byExtension.get(notice.extensionPath);
    if (group) group.messages.push(notice.message);
    else byExtension.set(notice.extensionPath, {name: notice.extensionName ?? extensionName(notice.extensionPath), messages: [notice.message]});
  }

  return (
    <Dialog className="h-auto" containerClassName="h-auto w-[min(calc(100vw-1rem),24rem)]" onOpenChange={setOpen} open={open} title="Extension limitations">
      <div className="-mx-1 flex max-h-[60svh] flex-col gap-5 overflow-y-auto px-1 pb-5 pt-2">
        {[...byExtension].map(([path, {name, messages}]) => (
          <section className="space-y-1.5" key={path}>
            <h3 className="truncate text-sm text-ink" title={path}>
              {name}
            </h3>
            <ul className="space-y-1 border-l border-border-muted pl-3">
              {messages.map((message, index) => (
                <li className="text-xs leading-relaxed text-ink-muted" key={index}>
                  {message}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
