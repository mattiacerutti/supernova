import type {FormEvent} from "react";
import {useState} from "react";
import type {ProviderLoginSession, ProviderLoginTextInput} from "@supernova/contracts/providers/schemas";
import {Effect, Stream} from "effect";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Input from "@/components/ui/input";
import AuthLink from "@/features/settings/components/providers/oauth/auth-link";
import TextInputForm from "@/features/settings/components/providers/oauth/text-input-form";
import {useSubmitProviderLoginInput} from "@/features/settings/hooks/api/auth/use-submit-provider-login-input";
import {useMountEffect} from "@/lib/use-mount-effect";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

function isComplete(session: ProviderLoginSession | undefined): boolean {
  return session?.step.type === "succeeded" || session?.step.type === "failed" || session?.step.type === "cancelled";
}

function activeTextInput(session: ProviderLoginSession | undefined): ProviderLoginTextInput | undefined {
  if (!session) return undefined;
  if (session.step.type === "prompt") return session.step.input;
  if (session.step.type === "browser_auth") return session.step.manualInput;
  return undefined;
}

interface ProviderOAuthContentProps {
  initialSession?: ProviderLoginSession;
  loginSessionId?: string;
  onClose: (cancelLogin: boolean) => void;
}

export default function ProviderOAuthContent(props: ProviderOAuthContentProps) {
  const {initialSession, loginSessionId, onClose} = props;
  const rpcClient = useAgentRpcClient();
  const submitInputMutation = useSubmitProviderLoginInput();
  const [session, setSession] = useState<ProviderLoginSession | undefined>(initialSession);
  const [input, setInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  useMountEffect(() => {
    if (!loginSessionId) return;

    let disposed = false;
    let interrupt: (() => Promise<void>) | undefined;
    void rpcClient
      .fork((rpc) => rpc.watchProviderLoginSession({loginSessionId}).pipe(Stream.runForEach((nextSession) => Effect.sync(() => !disposed && setSession(nextSession)))))
      .then((fiber) => {
        if (disposed) {
          void fiber.interrupt();
          return;
        }
        interrupt = fiber.interrupt;
      });

    return () => {
      disposed = true;
      void interrupt?.();
    };
  });

  const textInput = activeTextInput(session);
  const complete = isComplete(session);
  const canSubmitTextInput = !!loginSessionId && !!textInput && (textInput.allowEmpty || input.trim().length > 0);
  const waitingForAuthorization = !complete && (session?.step.type === "browser_auth" || session?.step.type === "device_code");

  const handleClose = (): void => {
    onClose(!complete);
  };

  const submitLoginInput = (value: string): void => {
    if (!loginSessionId) return;

    submitInputMutation.mutate(
      {input: value, loginSessionId},
      {
        onSuccess: () => {
          setInput("");
        },
      }
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmitTextInput) return;
    submitLoginInput(input);
  };

  const handleCopyDeviceCode = (): void => {
    if (session?.step.type !== "device_code") return;

    void navigator.clipboard.writeText(session.step.userCode).then(() => {
      setCopiedCode(true);
    });
  };

  return (
    <div className="space-y-2 pb-4 pt-1">
      {(!session || session.step.type === "starting") && (
        <div className="flex items-center gap-2 py-2 text-sm text-neutral-500">
          <Icon className="animate-spin text-neutral-600" name="loader" size="sm" />
          <span>Starting login...</span>
        </div>
      )}

      {session?.step.type === "select" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-400">{session.step.message}</p>
          <div className="-ml-3 -mr-3 space-y-0.5">
            {session.step.options.map((option) => (
              <Button
                className="flex w-full items-center justify-between rounded-xl corner-superellipse/1.3 px-3 py-2 text-left hover:bg-white/6"
                disabled={submitInputMutation.isPending}
                key={option.id}
                onClick={() => submitLoginInput(option.id)}
                variant="bare"
              >
                <span className="text-sm text-neutral-200">{option.label}</span>
                <Icon className="text-neutral-500" name="arrow-right" size="xs" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {session?.step.type === "browser_auth" && (
        <div className="space-y-2">
          <div className="space-y-1">
            {session.step.instructions && <p className="text-sm text-neutral-400">{session.step.instructions}</p>}
            {session.step.authUrl && <AuthLink href={session.step.authUrl} />}
          </div>
          {session.step.manualInput && (
            <div className="space-y-2 pt-3">
              <p className="text-xs text-neutral-600">{session.step.manualInput.message}</p>
              <form id="provider-login-input-form" onSubmit={handleSubmit}>
                <Input
                  autoFocus
                  disabled={submitInputMutation.isPending}
                  id="provider-login-input"
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={session.step.manualInput.placeholder}
                  value={input}
                />
              </form>
            </div>
          )}
        </div>
      )}

      {session?.step.type === "device_code" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-sm text-neutral-400">Open the verification page and enter this code.</p>
            <AuthLink href={session.step.verificationUri} label="Open verification page" />
          </div>
          <div className="space-y-1 pt-3">
            <div className="flex items-center gap-3">
              <code className="select-all whitespace-nowrap font-mono text-lg font-semibold tracking-widest text-neutral-100">{session.step.userCode}</code>
              <Button className="w-auto shrink-0 px-2.5 py-1 text-xs" onClick={handleCopyDeviceCode} size="sm" variant="primary">
                {copiedCode ? "Copied" : "Copy"}
              </Button>
            </div>
            {session.step.expiresInSeconds && <p className="text-xs text-neutral-600">This code expires in about {Math.ceil(session.step.expiresInSeconds / 60)} minutes.</p>}
          </div>
        </div>
      )}

      {session?.step.type === "prompt" && (
        <TextInputForm disabled={submitInputMutation.isPending} input={session.step.input} onChange={setInput} onSubmit={handleSubmit} value={input} />
      )}

      {session?.progress && !complete && (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Icon className="animate-spin text-neutral-600" name="loader" size="sm" />
          <span>{session.progress}</span>
        </div>
      )}

      {waitingForAuthorization && (
        <div className="flex items-center gap-2">
          <Icon className="animate-spin text-neutral-500" name="loader" size="sm" />
          <span className="text-sm text-neutral-500">Waiting for authorization...</span>
        </div>
      )}

      {session?.step.type === "succeeded" && (
        <div className="flex items-center gap-2 py-2">
          <Icon className="text-emerald-400" name="check" size="sm" />
          <p className="text-sm text-emerald-400">Provider connected successfully.</p>
        </div>
      )}

      {(session?.step.type === "failed" || !loginSessionId) && (
        <div className="flex items-center gap-2">
          <Icon className="text-red-400" name="x" size="sm" />
          <p className="text-sm text-red-400">{session?.step.type === "failed" ? session.step.error : "Login failed. Please try again later."}</p>
        </div>
      )}

      {session?.step.type === "cancelled" && <p className="text-sm text-neutral-500">Login cancelled.</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button className="w-auto px-3 text-xs" onClick={handleClose} size="sm" variant="primary">
          {complete ? "Close" : "Cancel"}
        </Button>
        {textInput && (
          <Button
            className="w-auto px-3 text-xs"
            disabled={submitInputMutation.isPending || !canSubmitTextInput}
            form="provider-login-input-form"
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
