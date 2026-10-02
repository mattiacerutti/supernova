import type {ServiceResult} from "@supernova/contracts/runtime/services";

/** A failed runtime call: `code` is the contract error's tag, such as `WorkspaceNotARepositoryError`. */
export class RuntimeError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
  }
}

/** The value of a runtime call, or throws its failure as a `RuntimeError`; for query and mutation functions. */
export async function unwrap<T>(result: Promise<ServiceResult<T>>): Promise<T> {
  const outcome = await result;
  if (outcome.ok) return outcome.value;
  throw new RuntimeError(outcome.error.code, outcome.error.message);
}

/** The contract error tag of a failure, or undefined for transport failures and defects. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof RuntimeError ? error.code : undefined;
}
