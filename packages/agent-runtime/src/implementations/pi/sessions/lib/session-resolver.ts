import type {PiSdkServiceShape} from "@supernova/agent-runtime/implementations/pi/pi-sdk";

export async function findSessionById(piSdk: PiSdkServiceShape, sessionId: string) {
  const sessions = await piSdk.SessionManager.listAll();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error("Session not found.");
  return session;
}
