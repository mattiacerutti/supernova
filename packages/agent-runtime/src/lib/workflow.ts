/**
 * One step of a workflow. `run` may return an undo that reverses its effect; undos run in reverse order when a later
 * required step fails. An optional step's failure is skipped and the step yields `undefined`.
 */
export interface WorkflowStep<T> {
  readonly name: string;
  readonly required: boolean;
  readonly run: () => Promise<{readonly value: T; readonly undo?: () => Promise<void>}>;
}

/** Runs steps in order, undoing what completed when a required step fails. Undo failures are swallowed so the cause surfaces. */
export class Workflow {
  private readonly undos: Array<() => Promise<void>> = [];

  public async step<T>(step: WorkflowStep<T> & {readonly required: true}): Promise<T>;
  public async step<T>(step: WorkflowStep<T> & {readonly required: false}): Promise<T | undefined>;
  public async step<T>(step: WorkflowStep<T>): Promise<T | undefined> {
    try {
      const result = await step.run();
      if (result.undo) this.undos.push(result.undo);
      return result.value;
    } catch (cause) {
      if (!step.required) return undefined;
      await this.rollback();
      throw cause;
    }
  }

  /** Reverses every completed step, newest first. */
  public async rollback(): Promise<void> {
    while (this.undos.length > 0) await this.undos.pop()!().catch(() => undefined);
  }
}
