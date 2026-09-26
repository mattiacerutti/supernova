import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import appIconLightUrl from "@assets/icon-black.png";
import appIconDarkUrl from "@assets/icon-white.png";
import {useCreateSession} from "@/features/sessions/api/conversation/create-session";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useSessionActions} from "@/features/sessions/api/conversation/session-actions";
import AttachmentDropOverlay from "@/features/sessions/components/conversation/attachment-drop-overlay";
import ModelPicker from "@/features/sessions/components/composer/toolbar/model-picker";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import ThinkingLevelPicker from "@/features/sessions/components/composer/toolbar/thinking-level-picker";
import {ComposerContext, useComposer} from "@/features/sessions/hooks/composer/use-composer";
import {newSessionComposerDraftKey} from "@/features/sessions/stores/composer/composer-drafts-store";
import {useConfiguration} from "@/api/configuration";
import {showToast} from "@/lib/toast";
import {useSettingsStore} from "@/stores/settings-store";

interface NewSessionPageProps {
  readonly projectName: string;
  readonly projectPath: string;
}

export default function NewSessionPage(props: NewSessionPageProps) {
  const {projectName, projectPath} = props;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();
  const {sendMessage} = useSessionActions();
  const resolvedMode = useSettingsStore((state) => state.resolvedMode);
  const configuration = useConfiguration(projectPath);

  const composer = useComposer({
    disabled: createSession.isPending || configuration.isFetching,
    draftKey: newSessionComposerDraftKey(projectPath),
    modelDefaults: configuration.data?.modelDefaults,
    projectPath,
  });
  const isPending = configuration.isPending || composer.isPending;

  const handleSubmit = (contentParts: readonly UserMessageContentPart[]): void => {
    const modelReference = composer.models.modelReference;
    if (composer.disabled || !modelReference) return;

    createSession.mutate(
      {projectPath},
      {
        onError: () => {
          showToast("Unable to create the session", "Please try again.");
        },
        onSuccess: (session) => {
          queryClient.setQueryData(sessionKeys.detail(session.id), session);
          composer.models.assignToSession(session.id, modelReference);
          sendMessage({contentParts, modelReference, sessionId: session.id});
          void navigate({params: {sessionId: session.id}, to: "/session/$sessionId"});
        },
      }
    );
  };

  return (
    <ComposerContext value={composer}>
      <div {...composer.attachments.dropZoneProps} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-16 pt-4">
        <div className="flex h-[min(calc(100svh-1rem),32rem)] w-[min(calc(100vw-2rem),48rem)] flex-col items-center justify-center overflow-visible">
          <div className="mb-8 flex flex-col items-center gap-3">
            <img src={resolvedMode === "light" ? appIconLightUrl : appIconDarkUrl} alt="Supernova" className="h-16 w-22 shrink-0" draggable={false} />
            <h1 className="text-center text-4xl font-normal tracking-tight text-ink-strong">
              What should we build in <i className="text-ink-muted">{projectName}</i>?
            </h1>
          </div>
          <div className="relative w-full">
            {isPending ? (
              <SessionComposerSkeleton />
            ) : (
              <SessionComposer key={`${composer.draftKey}:${composer.draft.revision}`} onSubmit={handleSubmit}>
                <ModelPicker />
                <ThinkingLevelPicker />
              </SessionComposer>
            )}
          </div>
        </div>
        {composer.attachments.isDraggingFiles && <AttachmentDropOverlay />}
      </div>
    </ComposerContext>
  );
}
