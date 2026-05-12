import {useState} from "react";
import type {FormEvent} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Input from "@/components/ui/input";
import {useProviderLoginSession} from "@/features/settings/hooks/api/auth/use-provider-login-session";
import {useSubmitProviderLoginInput} from "@/features/settings/hooks/api/auth/use-submit-provider-login-input";

interface ProviderOAuthLoginContentProps {
  loginSessionId?: string;
  onClose: (cancelLogin: boolean) => void;
}

export default function ProviderOAuthLoginContent(props: ProviderOAuthLoginContentProps) {
  const {loginSessionId, onClose} = props;
  const [input, setInput] = useState("");
  const [manualFallbackVisible, setManualFallbackVisible] = useState(false);

  const sessionQuery = useProviderLoginSession(loginSessionId);

  const submitInputMutation = useSubmitProviderLoginInput();
  const session = sessionQuery.data;

  const waitingForInput = session?.status === "waiting_input";
  const isManualCodeFallback = waitingForInput && session?.inputKind === "manual_code" && !!session.authUrl;
  const isComplete = session?.status === "succeeded" || session?.status === "failed" || session?.status === "cancelled";
  const showPromptContinue = waitingForInput && !isManualCodeFallback;
  const showManualCodeContinue = isManualCodeFallback && manualFallbackVisible;

  const handleClose = (): void => {
    onClose(!isComplete);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!loginSessionId || !session) return;
    if (!session.allowEmptyInput && input.trim().length === 0) return;

    submitInputMutation.mutate(
      {input, loginSessionId},
      {
        onSuccess: () => {
          setInput("");
          setManualFallbackVisible(false);
        },
      }
    );
  };

  const isPending = sessionQuery.isLoading || (session?.authUrl === undefined && session?.status === "authenticating");

  return (
    <div className="space-y-4 pb-4 pt-1">
      {isPending && (
        <div className="flex items-center gap-3 py-2 text-sm text-neutral-500">
          <Icon className="animate-spin text-neutral-600" name="loader" size="sm" />
          <span>Starting login...</span>
        </div>
      )}
      {session?.authUrl && (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-neutral-500">Instructions</p>
            <div>
              <p className="min-w-0 flex-1 select-text text-sm leading-6 text-neutral-300">{session.instructions || "A browser window should open. Complete login to finish."}</p>
              <a
                className="inline-flex items-center gap-1.5 text-sm text-neutral-200 underline underline-offset-4 hover:text-white"
                href={session.authUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open authentication page
                <Icon name="arrow-right" size="xs" />
              </a>
            </div>
          </div>

          {isManualCodeFallback && (
            <div className="space-y-3">
              {!manualFallbackVisible && (
                <Button className="flex w-fit items-center gap-1.5 px-0 text-xs" onClick={() => setManualFallbackVisible(true)} size="sm" variant="ghost">
                  <Icon name="edit" size="xs" />
                  <span>Paste redirect URL or code instead</span>
                </Button>
              )}
              {manualFallbackVisible && (
                <form className="space-y-3" id="provider-login-manual-code-form" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-neutral-500" htmlFor="manual-code-input">
                      Redirect URL or authorization code
                    </label>
                    <Input
                      autoFocus
                      id="manual-code-input"
                      onChange={(event) => setInput(event.target.value)}
                      placeholder={session.placeholder || "Paste URL or code"}
                      value={input}
                    />
                  </div>
                </form>
              )}
            </div>
          )}

          {!isComplete && (
            <div className="flex items-center gap-3">
              <Icon className="animate-spin text-neutral-500" name="loader" size="sm" />
              <span className="text-sm text-neutral-500">Waiting for authorization...</span>
            </div>
          )}
        </div>
      )}
      {session?.progress && !isComplete && (
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <Icon className="animate-spin text-neutral-600" name="loader" size="sm" />
          <span>{session.progress}</span>
        </div>
      )}
      {showPromptContinue && (
        <form className="space-y-4" id="provider-login-prompt-form" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-300" htmlFor="prompt-input">
              {session.prompt}
            </label>
            <Input autoFocus id="prompt-input" onChange={(event) => setInput(event.target.value)} placeholder={session.placeholder || undefined} value={input} />
          </div>
        </form>
      )}
      {session?.status === "succeeded" && (
        <div className="flex items-center gap-3 py-2">
          <div className="grid size-6 place-items-center rounded-full bg-emerald-500/15">
            <Icon className="text-emerald-400" name="check" size="xs" />
          </div>
          <p className="text-sm text-emerald-400">Provider connected successfully.</p>
        </div>
      )}

      {(session?.status === "failed" || !loginSessionId) && (
        <div className="flex items-center gap-3">
          <Icon className="text-red-400" name="x" size="sm" />
          <p className="text-sm text-red-400">Login failed. Please try again later.</p>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button className="w-auto px-3 text-xs" onClick={handleClose} size="sm" variant="primary">
          {isComplete ? "Close" : "Cancel"}
        </Button>
        {showPromptContinue && session && (
          <Button
            className="w-auto px-3 text-xs"
            disabled={submitInputMutation.isPending || (!session.allowEmptyInput && input.trim().length === 0)}
            form="provider-login-prompt-form"
            size="sm"
            type="submit"
            variant="primary"
          >
            Continue
          </Button>
        )}
        {showManualCodeContinue && (
          <Button
            className="w-auto px-3 text-xs"
            disabled={submitInputMutation.isPending || input.trim().length === 0}
            form="provider-login-manual-code-form"
            size="sm"
            type="submit"
            variant="primary"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
