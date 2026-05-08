import type {IPiSessionSdkService} from "@pi-desktop/agent-runtime/providers/pi/sessions/pi-session-sdk";

export async function findSessionById(sessionSdk: IPiSessionSdkService, sessionId: string) {
  const sessions = await sessionSdk.listSessions();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error("Session not found.");
  return session;
}
