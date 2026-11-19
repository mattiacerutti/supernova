import {local} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {ChatDocument} from "@supernova/contracts/services/chat/schemas";
import type {Chat} from "@supernova/agent-runtime/features/chat/natives/chat";
import {nativeRegistry} from "@supernova/agent-runtime/lib/chord/natives";

// The session host's one chat: it owns the session's running work, whoever holds `ChatService`.
export const ChatStore = local("supernova.store.chat", {version: 1, params: {}, members: {document: json<ChatDocument>()}});
export const ChatNative = nativeRegistry<Chat>("supernova.native.chat");
