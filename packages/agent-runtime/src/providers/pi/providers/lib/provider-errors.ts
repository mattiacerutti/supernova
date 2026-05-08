export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
