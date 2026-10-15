export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function directoryOf(path: string): string {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex === -1 ? "" : path.slice(0, separatorIndex);
}
