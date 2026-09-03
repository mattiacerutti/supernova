import type {ReactNode} from "react";

interface SettingsPageShellProps {
  children: ReactNode;
}

export default function SettingsPageShell(props: SettingsPageShellProps) {
  const {children} = props;

  return (
    <div className="scroll-fade-y min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-5 pb-12 pt-6 sm:px-6">{children}</div>
    </div>
  );
}
