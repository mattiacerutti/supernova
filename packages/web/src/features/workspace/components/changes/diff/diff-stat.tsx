function formatCount(value: number): string {
  if (value < 1_000) return `${value}`;
  if (value < 10_000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value / 1_000)}k`;
}

interface DiffStatProps {
  readonly additions: number;
  readonly deletions: number;
}

export default function DiffStat(props: DiffStatProps) {
  const {additions, deletions} = props;
  if (additions === 0 && deletions === 0) return null;

  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-xs">
      {additions > 0 && <span className="text-diff-added">+{formatCount(additions)}</span>}
      {deletions > 0 && <span className="text-diff-removed">-{formatCount(deletions)}</span>}
    </span>
  );
}
