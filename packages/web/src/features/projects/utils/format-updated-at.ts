export function formatUpdatedAt(value: string): string {
  const updatedAt = new Date(value).getTime();
  if (Number.isNaN(updatedAt)) return "";

  const elapsedMs = Date.now() - updatedAt;
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) return "Today";

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return "Today";

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}d`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  return `${elapsedMonths}mo`;
}
