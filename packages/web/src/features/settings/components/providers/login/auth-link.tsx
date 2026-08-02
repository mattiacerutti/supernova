import Icon from "@/components/ui/icon";

interface AuthLinkProps {
  href: string;
  label?: string;
}

export default function AuthLink(props: AuthLinkProps) {
  const {href, label = "Open authentication page"} = props;

  return (
    <a className="inline-flex items-center gap-1 text-sm text-ink underline underline-offset-4 hover:text-ink-strong" href={href} rel="noreferrer" target="_blank">
      {label}
      <Icon name="arrow-right" size="xs" />
    </a>
  );
}
