/** Formats an ISO timestamp as a compact relative age label. */
export function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "";

  const elapsedMs = Date.now() - timestamp;

  const elapsedSeconds = Math.floor(elapsedMs / 1_000);
  if (elapsedSeconds < 60) return "now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}d`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  return `${elapsedMonths}mo`;
}
