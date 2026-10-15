const SERVER_ONLY_VARIABLES = ["ELECTRON_RUN_AS_NODE", "PI_CODING_AGENT_DIR", "PI_PACKAGE_DIR", "SUPERNOVA_SERVER_DEV"];

export function userProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !SERVER_ONLY_VARIABLES.includes(key)) env[key] = value;
  }
  return env;
}
