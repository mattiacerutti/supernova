import type {ModelDefaults} from "@supernova/contracts/configuration/schemas";
import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import {createContext, use} from "react";
import type {ComposerAttachments} from "@/features/sessions/hooks/composer/use-composer-attachments";
import {useComposerAttachments} from "@/features/sessions/hooks/composer/use-composer-attachments";
import type {ComposerDraft} from "@/features/sessions/hooks/composer/use-composer-draft";
import {useComposerDraft} from "@/features/sessions/hooks/composer/use-composer-draft";
import type {ModelSelection} from "@/features/sessions/hooks/composer/use-model-selection";
import {useModelSelection} from "@/features/sessions/hooks/composer/use-model-selection";

interface UseComposerOptions {
  /** Stable key the draft persists under while the user navigates away. */
  readonly draftKey: string;
  /** Disables input for reasons outside the composer, such as a pending create. */
  readonly disabled?: boolean;
  readonly modelDefaults?: ModelDefaults;
  readonly initialModelReference?: ModelReference;
  readonly projectPath: string;
  readonly sessionId?: string;
}

export interface Composer {
  readonly attachments: ComposerAttachments;
  /** True while models are loading or nothing is selectable; the composer renders its skeleton. */
  readonly isPending: boolean;
  readonly disabled: boolean;
  readonly draft: ComposerDraft;
  readonly draftKey: string;
  readonly models: ModelSelection;
  readonly projectPath: string;
  readonly selectModel: (key: string) => void;
}

/** Composes draft, attachments, and model selection for one composer instance. Share it through `ComposerContext`. */
export function useComposer(options: UseComposerOptions): Composer {
  const {disabled: externallyDisabled = false, draftKey, initialModelReference, modelDefaults, projectPath, sessionId} = options;

  const models = useModelSelection({defaults: modelDefaults, initialSelection: initialModelReference, projectPath, sessionId});
  const draft = useComposerDraft(draftKey);
  const disabled = externallyDisabled || models.isPending || !models.modelReference;
  const attachments = useComposerAttachments({
    attachments: draft.attachments,
    disabled,
    imageSupported: models.selectedModelDetails?.capabilities.images === true,
    onAttachmentsChange: draft.setAttachments,
  });

  const selectModel = (key: string): void => {
    const nextModel = models.findModel(key);
    if (!nextModel) return;

    if (!nextModel.capabilities.images) attachments.removeUnsupportedImages();
    models.selectModel(key);
  };

  return {attachments, disabled, draft, draftKey, isPending: models.isPending, models, projectPath, selectModel};
}

export const ComposerContext = createContext<Composer | null>(null);

/** Reads the composer built by `useComposer`; requires `ComposerContext` above the caller. */
export function useComposerContext(): Composer {
  const composer = use(ComposerContext);
  if (!composer) throw new Error("ComposerContext is not available.");
  return composer;
}
