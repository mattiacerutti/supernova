import type {FormEvent} from "react";
import {useState} from "react";
import type {LoginNotice, LoginPrompt, LoginState} from "@supernova/contracts/services/providers/schemas";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Input from "@/components/ui/input";
import AuthLink from "@/features/settings/components/providers/login/auth-link";

interface ProviderLoginContentProps {
  readonly login: LoginState;
  readonly onAnswer: (prompt: LoginPrompt, value: string) => void;
  readonly onClose: () => void;
}

export default function ProviderLoginContent(props: ProviderLoginContentProps) {
  const {login, onAnswer, onClose} = props;
  const [draft, setDraft] = useState({promptId: "", value: ""});
  const prompt = login.prompt;
  const value = draft.promptId === prompt?.id ? draft.value : "";
  const working = login.status === "working";
  const instruction = login.notices.findLast((notice) => notice.type !== "progress");
  const progress = login.notices.at(-1)?.type === "progress" ? login.notices.at(-1) : undefined;

  return (
    <div className="space-y-2 pb-4 pt-1">
      {instruction && <Notice notice={instruction} />}
      {prompt && <PromptForm onAnswer={onAnswer} onChange={(changed) => setDraft({promptId: prompt.id, value: changed})} prompt={prompt} value={value} />}

      {working && !prompt && (
        <div className="flex items-center gap-2 py-2 text-sm text-ink-muted">
          <Icon className="animate-spin text-ink-faint" name="loader" size="sm" />
          <span>{progress?.type === "progress" ? progress.message : instruction ? "Waiting for authorization..." : "Starting login..."}</span>
        </div>
      )}

      {login.status === "success" && (
        <div className="flex items-center gap-2 py-2">
          <Icon className="text-diff-added" name="check" size="sm" />
          <p className="text-sm text-diff-added">Provider configuration saved.</p>
        </div>
      )}

      {login.status === "error" && (
        <div className="flex items-center gap-2">
          <Icon className="text-danger-ink" name="x" size="sm" />
          <p className="text-sm text-danger-ink">{login.message}</p>
        </div>
      )}

      {login.status === "cancelled" && <p className="text-sm text-ink-muted">Login cancelled.</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button className="rounded-xl corner-superellipse/1.3 px-3 py-2 text-sm text-ink-muted hover:bg-overlay-hover hover:text-ink-strong" onClick={onClose} variant="bare">
          {working ? "Cancel" : "Close"}
        </Button>
        {prompt && prompt.type !== "select" && (
          <Button
            className="rounded-xl corner-superellipse/1.3 bg-overlay-pressed px-3 py-2 text-sm text-ink-strong hover:bg-overlay-strong disabled:hover:bg-overlay-pressed"
            disabled={value.trim().length === 0}
            form="provider-login-input-form"
            type="submit"
            variant="bare"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function Notice(props: {readonly notice: LoginNotice}) {
  const {notice} = props;
  const [copied, setCopied] = useState(false);

  switch (notice.type) {
    case "info":
      return (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">{notice.message}</p>
          {notice.links?.map((link) => (
            <AuthLink href={link.url} key={link.url} label={link.label} />
          ))}
        </div>
      );
    case "auth_url":
      return (
        <div className="space-y-1">
          {notice.instructions && <p className="text-sm text-ink-muted">{notice.instructions}</p>}
          <AuthLink href={notice.url} />
        </div>
      );
    case "device_code":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-sm text-ink-muted">Open the verification page and enter this code.</p>
            <AuthLink href={notice.verificationUri} label="Open verification page" />
          </div>
          <div className="space-y-1 pt-3">
            <div className="flex items-center gap-3">
              <code className="select-all whitespace-nowrap font-mono text-lg font-semibold tracking-widest text-ink-strong">{notice.userCode}</code>
              <Button
                className="w-auto shrink-0 rounded-xl bg-overlay-pressed px-2.5 py-1 text-xs text-ink hover:bg-overlay-strong hover:text-ink-strong"
                onClick={() => void navigator.clipboard.writeText(notice.userCode).then(() => setCopied(true))}
                size="sm"
                variant="primary"
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {notice.expiresInSeconds && <p className="text-xs text-ink-faint">This code expires in about {Math.ceil(notice.expiresInSeconds / 60)} minutes.</p>}
          </div>
        </div>
      );
    case "progress":
      return null;
  }
}

interface PromptFormProps {
  readonly prompt: LoginPrompt;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onAnswer: (prompt: LoginPrompt, value: string) => void;
}

function PromptForm(props: PromptFormProps) {
  const {onAnswer, onChange, prompt, value} = props;

  if (prompt.type === "select") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">{prompt.message}</p>
        <div className="-ml-3 -mr-3 space-y-0.5">
          {prompt.options.map((option) => (
            <Button
              className="flex w-full items-center justify-between rounded-xl corner-superellipse/1.3 px-3 py-2 text-left hover:bg-overlay-hover"
              key={option.id}
              onClick={() => onAnswer(prompt, option.id)}
              variant="bare"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink">{option.label}</span>
                {option.description && <span className="block truncate text-xs text-ink-faint">{option.description}</span>}
              </span>
              <Icon className="text-ink-muted" name="arrow-right" size="xs" />
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (value.trim()) onAnswer(prompt, value);
  };

  return (
    <form className="space-y-2 pt-3" id="provider-login-input-form" onSubmit={handleSubmit}>
      <label className="block text-sm text-ink" htmlFor="provider-login-input">
        {prompt.message}
      </label>
      <Input
        autoFocus
        id="provider-login-input"
        onChange={(event) => onChange(event.target.value)}
        placeholder={prompt.placeholder}
        type={prompt.type === "secret" ? "password" : "text"}
        value={value}
      />
    </form>
  );
}
