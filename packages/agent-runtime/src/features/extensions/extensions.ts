import {UpdateExtensionsError} from "@supernova/contracts/services/extensions/procedures";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface ExtensionsDeps {
  readonly resourceCache: Pick<ResourceCache, "invalidate">;
  readonly sdk: Pick<PiSdk, "updatePackages">;
}

export class Extensions {
  private pendingUpdate: Promise<void> | undefined;

  public constructor(private readonly deps: ExtensionsDeps) {}

  public update(): Promise<void> {
    this.pendingUpdate ??= this.runUpdate().finally(() => {
      this.pendingUpdate = undefined;
    });
    return this.pendingUpdate;
  }

  private async runUpdate(): Promise<void> {
    try {
      await this.deps.sdk.updatePackages();
    } catch (cause) {
      throw new UpdateExtensionsError({cause, message: errorMessage(cause, "Failed to update extensions.")});
    } finally {
      // Even a partial failure may have replaced some packages on disk; drop the cached composer skills and prompts.
      this.deps.resourceCache.invalidate();
    }
  }
}
