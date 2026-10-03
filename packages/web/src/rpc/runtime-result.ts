import type {ServiceResult} from "@supernova/contracts/runtime/services";

/** The failure codes a service method can return: its declared errors' tags and `GenericError`. */
export type FailureCode<Method> = Method extends (...args: never[]) => Promise<infer Result>
  ? Result extends {readonly ok: false; readonly error: {readonly code: infer Code extends string}}
    ? Code
    : never
  : never;

/** A failed runtime call. `code` is the contract error's tag; `RuntimeError<FailureCode<M>>` narrows it to a method's. */
export class RuntimeError<Code extends string = string> extends Error {
  public readonly code: Code;

  public constructor(code: Code, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
  }
}

/**
 * The value of a runtime call, or throws its failure as a `RuntimeError`; for query and mutation functions, whose
 * `error` is then a `RuntimeError` of the method's codes (see `FailureCode`). Failures the server returned are logged
 * with their code; transport failures are logged by the runtime client.
 */
export async function unwrap<T>(result: Promise<ServiceResult<T, {readonly _tag: string}>>): Promise<T> {
  const outcome = await result;
  if (outcome.ok) return outcome.value;
  console.error(`[runtime] ${outcome.error.code}: ${outcome.error.message}`);
  throw new RuntimeError(outcome.error.code, outcome.error.message);
}

/** A caught error as a `RuntimeError` of `Method`'s codes, or undefined for transport failures and other errors. */
export function runtimeError<Method>(error: unknown): RuntimeError<FailureCode<Method>> | undefined {
  return error instanceof RuntimeError ? (error as RuntimeError<FailureCode<Method>>) : undefined;
}
