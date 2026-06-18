/** Format a session timestamp as a compact relative age label. */
export function formatUpdatedAt(value: string): string {
  const updatedAt = new Date(value).getTime();
  if (Number.isNaN(updatedAt)) return "";

  const elapsedMs = Date.now() - updatedAt;

  const elapsedSeconds = Math.floor(elapsedMs / 1_000);
  if (elapsedSeconds < 60) return "just now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}d`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  return `${elapsedMonths}mo`;
}
