/** Converts an unknown provider error cause into a user-facing message. */
export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
