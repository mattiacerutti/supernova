import type {Host, Link} from "@earendil-works/chord";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {ServerHostHandle, ServerHostOptions} from "@supernova/agent-runtime/composition/server-host";
import {startServerHost} from "@supernova/agent-runtime/composition/server-host";

export interface TestClient {
  readonly host: Host<RuntimePrincipal>;
  readonly received: readonly Uint8Array[];
  readonly disconnect: () => void;
}

function recording(link: Link, received: Uint8Array[]): Link {
  return {
    send: (message) => {
      received.push(message);
      link.send(message);
    },
    onMessage: (listener) => link.onMessage(listener),
    onClose: (listener) => link.onClose(listener),
    close: () => link.close(),
  };
}

export async function startTestServerHost(options: ServerHostOptions): Promise<{
  readonly serverHost: ServerHostHandle;
  readonly client: Host<RuntimePrincipal>;
  readonly connectClient: (principal?: RuntimePrincipal) => Promise<TestClient>;
  readonly close: () => Promise<void>;
}> {
  const serverHost = await startServerHost(options);
  const clients: Host<RuntimePrincipal>[] = [];
  const connectClient = async (principal: RuntimePrincipal = {kind: "owner"}): Promise<TestClient> => {
    const received: Uint8Array[] = [];
    const [down, up] = memoryLinkPair();
    serverHost.host.accept(recording(down, received), {principal}, BACKGROUND_CONTEXT);
    const host = createHost<RuntimePrincipal>({onError: () => undefined});
    host.connect(up, {principal: {kind: "server"}}, BACKGROUND_CONTEXT);
    await host.load([], BACKGROUND_CONTEXT);
    clients.push(host);
    return {host, received, disconnect: () => down.close()};
  };

  let closing: Promise<void> | undefined;
  return {
    serverHost,
    client: (await connectClient()).host,
    connectClient,
    close: () =>
      (closing ??= (async () => {
        for (const client of clients) await client.close(BACKGROUND_CONTEXT);
        await serverHost.close();
      })()),
  };
}
