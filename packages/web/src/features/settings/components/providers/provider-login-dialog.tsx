import type {FormEvent} from "react";
import {useRef, useState} from "react";
import type {ProviderLoginSession} from "@supernova/contracts/providers/schemas";
import {Effect, Stream} from "effect";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Input from "@/components/ui/input";
import AuthLink from "@/features/settings/components/providers/login/auth-link";
import {useSubmitProviderLoginInput} from "@/features/settings/hooks/api/auth/use-submit-provider-login-input";
import {useMountEffect} from "@/lib/use-mount-effect";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface ProviderLoginContentProps {
  initialSession?: ProviderLoginSession;
  loginSessionId?: string;
  onClose: (cancelLogin: boolean) => void;
}

export default function ProviderLoginContent(props: ProviderLoginContentProps) {
  const {initialSession, loginSessionId, onClose} = props;
  const rpcClient = useAgentRpcClient();
  const submitInputMutation = useSubmitProviderLoginInput();
  const [session, setSession] = useState<ProviderLoginSession | undefined>(initialSession);
  const [input, setInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [pendingOptionId, setPendingOptionId] = useState<string | undefined>();
  const [waitingForNextStep, setWaitingForNextStep] = useState(false);
  const pendingStepKeyRef = useRef<string | undefined>(undefined);

  useMountEffect(() => {
    if (!loginSessionId) return;

    let disposed = false;
    let interrupt: (() => Promise<void>) | undefined;
    void rpcClient
      .fork((rpc) =>
        rpc.watchProviderLoginSession({loginSessionId}).pipe(
          Stream.runForEach((nextSession) =>
            Effect.sync(() => {
              if (disposed || nextSession.step.type === "authenticating") return;

              const pendingStepKey = pendingStepKeyRef.current;
              if (!pendingStepKey) {
                setSession(nextSession);
                return;
              }
              if (JSON.stringify(nextSession.step) === pendingStepKey) {
                setSession(nextSession);
                return;
              }

              pendingStepKeyRef.current = undefined;
              setPendingOptionId(undefined);
              setWaitingForNextStep(false);
              setInput("");
              setSession(nextSession);
            })
          )
        )
      )
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

  const textInput = session?.step.type === "prompt" ? session.step.input : session?.step.type === "browser_auth" ? session.step.manualInput : undefined;
  const complete = session?.step.type === "succeeded" || session?.step.type === "failed" || session?.step.type === "cancelled";
  const canSubmitTextInput = !!loginSessionId && !!textInput && input.trim().length > 0;
  const waitingForAuthorization = !waitingForNextStep && !complete && (session?.step.type === "browser_auth" || session?.step.type === "device_code");

  const handleClose = (): void => {
    onClose(!complete);
  };

  const submitLoginInput = (value: string, optionId?: string): void => {
    if (!loginSessionId || !session) return;

    pendingStepKeyRef.current = JSON.stringify(session.step);
    setPendingOptionId(optionId);
    setWaitingForNextStep(true);
    submitInputMutation.mutate(
      {input: value, loginSessionId},
      {
        onError: () => {
          pendingStepKeyRef.current = undefined;
          setPendingOptionId(undefined);
          setWaitingForNextStep(false);
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
        <div className="flex items-center gap-2 py-2 text-sm text-ink-muted">
          <Icon className="animate-spin text-ink-faint" name="loader" size="sm" />
          <span>Starting login...</span>
        </div>
      )}

      {session?.step.type === "select" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">{session.step.message}</p>
          <div className="-ml-3 -mr-3 space-y-0.5">
            {session.step.options.map((option) => (
              <Button
                className="flex w-full items-center justify-between rounded-xl corner-superellipse/1.3 px-3 py-2 text-left hover:bg-overlay-hover"
                disabled={waitingForNextStep}
                key={option.id}
                onClick={() => submitLoginInput(option.id, option.id)}
                variant="bare"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{option.label}</span>
                  {option.description && <span className="block truncate text-xs text-ink-faint">{option.description}</span>}
                </span>
                <Icon className={pendingOptionId === option.id ? "animate-spin text-ink-muted" : "text-ink-muted"} name={pendingOptionId === option.id ? "loader" : "arrow-right"} size="xs" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {session?.step.type === "info" && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">{session.step.message}</p>
          {session.step.links.map((link) => (
            <AuthLink href={link.url} key={link.url} label={link.label} />
          ))}
        </div>
      )}

      {session?.step.type === "browser_auth" && (
        <div className="space-y-2">
          <div className="space-y-1">
            {session.step.instructions && <p className="text-sm text-ink-muted">{session.step.instructions}</p>}
            {session.step.authUrl && <AuthLink href={session.step.authUrl} />}
          </div>
        </div>
      )}

      {textInput && (
        <form className="space-y-2 pt-3" id="provider-login-input-form" onSubmit={handleSubmit}>
          <label className="block text-sm text-ink" htmlFor="provider-login-input">
            {textInput.message}
          </label>
          <Input
            autoFocus
            disabled={waitingForNextStep}
            id="provider-login-input"
            onChange={(event) => setInput(event.target.value)}
            placeholder={textInput.placeholder}
            type={textInput.secret ? "password" : "text"}
            value={input}
          />
        </form>
      )}

      {session?.step.type === "device_code" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-sm text-ink-muted">Open the verification page and enter this code.</p>
            <AuthLink href={session.step.verificationUri} label="Open verification page" />
          </div>
          <div className="space-y-1 pt-3">
            <div className="flex items-center gap-3">
              <code className="select-all whitespace-nowrap font-mono text-lg font-semibold tracking-widest text-ink-strong">{session.step.userCode}</code>
              <Button className="w-auto shrink-0 px-2.5 py-1 text-xs" onClick={handleCopyDeviceCode} size="sm" variant="primary">
                {copiedCode ? "Copied" : "Copy"}
              </Button>
            </div>
            {session.step.expiresInSeconds && <p className="text-xs text-ink-faint">This code expires in about {Math.ceil(session.step.expiresInSeconds / 60)} minutes.</p>}
          </div>
        </div>
      )}

      {session?.progress && !complete && !waitingForNextStep && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Icon className="animate-spin text-ink-faint" name="loader" size="sm" />
          <span>{session.progress}</span>
        </div>
      )}

      {waitingForAuthorization && (
        <div className="flex items-center gap-2">
          <Icon className="animate-spin text-ink-muted" name="loader" size="sm" />
          <span className="text-sm text-ink-muted">Waiting for authorization...</span>
        </div>
      )}

      {session?.step.type === "succeeded" && (
        <div className="flex items-center gap-2 py-2">
          <Icon className="text-diff-added" name="check" size="sm" />
          <p className="text-sm text-diff-added">Provider configuration saved.</p>
        </div>
      )}

      {session?.step.type === "failed" && (
        <div className="flex items-center gap-2">
          <Icon className="text-danger-ink" name="x" size="sm" />
          <p className="text-sm text-danger-ink">{session.step.error}</p>
        </div>
      )}

      {session?.step.type === "cancelled" && <p className="text-sm text-ink-muted">Login cancelled.</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button className="w-auto px-3 text-xs" onClick={handleClose} size="sm" variant="primary">
          {complete ? "Close" : "Cancel"}
        </Button>
        {textInput && (
          <Button
            className="w-auto px-3 text-xs"
            disabled={waitingForNextStep || !canSubmitTextInput}
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
