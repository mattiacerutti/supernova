/** The message of a thrown value, or `fallback` when it is not an Error. */
export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
