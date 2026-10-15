import type {ServiceResult} from "@supernova/contracts/lib/protocol";

export type FailureCode<Method> = Method extends (...args: never[]) => Promise<infer Result>
  ? Result extends {readonly ok: false; readonly error: {readonly code: infer Code extends string}}
    ? Code
    : never
  : never;

export class RuntimeError<Code extends string = string> extends Error {
  public readonly code: Code;

  public constructor(code: Code, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
  }
}

export async function unwrap<T>(result: Promise<ServiceResult<T, {readonly _tag: string}>>): Promise<T> {
  const outcome = await result;
  if (outcome.ok) return outcome.value;
  console.error(`[runtime] ${outcome.error.code}: ${outcome.error.message}`);
  throw new RuntimeError(outcome.error.code, outcome.error.message);
}

export function runtimeError<Method>(error: unknown): RuntimeError<FailureCode<Method>> | undefined {
  return error instanceof RuntimeError ? (error as RuntimeError<FailureCode<Method>>) : undefined;
}
