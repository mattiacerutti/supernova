import type {FormEvent} from "react";
import type {ProviderLoginTextInput} from "@supernova/contracts/providers/schemas";
import Input from "@/components/ui/input";

interface TextInputFormProps {
  disabled: boolean;
  input: ProviderLoginTextInput;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  value: string;
}

export default function TextInputForm(props: TextInputFormProps) {
  const {disabled, input, onChange, onSubmit, value} = props;

  return (
    <form className="space-y-2" id="provider-login-input-form" onSubmit={onSubmit}>
      <label className="block text-sm text-neutral-300" htmlFor="provider-login-input">
        {input.message}
      </label>
      <Input autoFocus disabled={disabled} id="provider-login-input" onChange={(event) => onChange(event.target.value)} placeholder={input.placeholder} value={value} />
    </form>
  );
}
