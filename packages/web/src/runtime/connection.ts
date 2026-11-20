import type {ConnectionState, Link, WebSocketLike} from "@earendil-works/chord";
import {createHost, keepConnected, webSocketLink} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {pageEnvironment} from "@earendil-works/chord/web";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {RUNTIME_SOCKET_PATH, TERMINAL_SOCKET_PATH} from "@supernova/contracts/lib/protocol";
import type {RuntimeClient} from "@/runtime/client";
import {runtimeClient} from "@/runtime/client";

// The timeline suite's build replaces this module (tests/timeline).

const context = BACKGROUND_CONTEXT;

export function resolveSocketUrl(endpoint: string, path = "/ws"): string {
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("The server endpoint must be an HTTP(S) URL without credentials.");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url.href;
}

export function createRuntimeClient(endpoint: string): RuntimeClient {
  const url = resolveSocketUrl(endpoint, RUNTIME_SOCKET_PATH);
  const terminalUrl = resolveSocketUrl(endpoint, TERMINAL_SOCKET_PATH);
  const host = createHost<RuntimePrincipal>({onError: (error) => console.error("[runtime]", error)});

  const connect = (onState: (state: ConnectionState) => void) => {
    const connection = keepConnected({
      open: (events) => {
        const socket = new WebSocket(url);
        socket.addEventListener("open", () => events.opened());
        socket.addEventListener("message", () => events.received());
        const link: Link = webSocketLink(socket as unknown as WebSocketLike);
        host.connect(link, {principal: {kind: "server"}}, context);
        return {close: () => link.close(), onClose: (listener) => socket.addEventListener("close", () => listener())};
      },
      onState,
      canRetry: async () => true,
      environment: pageEnvironment(),
    });
    return () => connection.stop();
  };

  return runtimeClient(host, {connect, terminalSocketUrl: (token) => `${terminalUrl}?${new URLSearchParams({token})}`});
}

let sharedClient: RuntimeClient | undefined;

export function getRuntimeClient(): RuntimeClient {
  sharedClient ??= createRuntimeClient(window.desktopApi?.serverUrl ?? window.location.origin);
  return sharedClient;
}
