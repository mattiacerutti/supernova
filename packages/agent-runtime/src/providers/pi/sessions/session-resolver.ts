import {SessionManager} from "@mariozechner/pi-coding-agent";

export async function findSessionById(sessionId: string) {
  const sessions = await SessionManager.listAll();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error("Session not found.");
  return session;
}
