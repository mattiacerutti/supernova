export function piToolSummary(toolName: string): string {
  switch (toolName) {
    case "bash":
      return "Ran command";
    case "ls":
      return "Listed files";
    case "read":
      return "Read file";
    case "edit":
    case "write":
      return "Edited file";
    case "find":
    case "grep":
      return "Explored files";
    default:
      return `Ran ${toolName}`;
  }
}
