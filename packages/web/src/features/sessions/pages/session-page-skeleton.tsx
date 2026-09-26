import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import SessionLayout, {SessionHeader} from "@/features/sessions/components/conversation/session-layout";
import {useCachedSessionTitle} from "@/features/sessions/hooks/conversation/use-cached-session-title";

interface SessionPageSkeletonProps {
  readonly sessionId: string;
}

/** Placeholder while a session loads. Shows the title from the sidebar cache when it is known. */
export default function SessionPageSkeleton(props: SessionPageSkeletonProps) {
  const {sessionId} = props;
  const cachedTitle = useCachedSessionTitle(sessionId);

  return (
    <SessionLayout>
      <SessionHeader>
        {cachedTitle ? (
          <span className="block truncate">{cachedTitle}</span>
        ) : (
          <span className="block h-4 w-36 animate-pulse rounded-full bg-overlay-pressed" aria-label="Loading session title" />
        )}
      </SessionHeader>
      <div className="min-h-0 flex-1" />
      <SessionComposerSkeleton />
    </SessionLayout>
  );
}
