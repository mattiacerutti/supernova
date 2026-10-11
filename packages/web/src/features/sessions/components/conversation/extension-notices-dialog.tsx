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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const notices = useSessionsStore((state) => (sessionId === null ? undefined : state.entries[sessionId]?.notices));

  useMountEffect(() => onOpenExtensionNotices(setSessionId));

  const byExtension = new Map<string, string[]>();
  for (const notice of notices ?? []) {
    if (notice.extensionPath === undefined) continue;
    byExtension.set(notice.extensionPath, [...(byExtension.get(notice.extensionPath) ?? []), notice.message]);
  }

  return (
    <Dialog
      className="h-auto"
      containerClassName="h-auto w-[min(calc(100vw-1rem),24rem)]"
      onOpenChange={(open) => !open && setSessionId(null)}
      open={sessionId !== null}
      title="Extension limitations"
    >
      <div className="-mx-1 flex max-h-[60svh] flex-col gap-5 overflow-y-auto px-1 pb-5 pt-2">
        {[...byExtension].map(([path, messages]) => (
          <section className="space-y-1.5" key={path}>
            <h3 className="truncate text-sm text-ink" title={path}>
              {extensionName(path)}
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
