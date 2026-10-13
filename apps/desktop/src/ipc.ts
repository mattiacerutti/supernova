export const DESKTOP_IPC_CHANNELS = {
  openDirectory: "desktop:open-directory",
  listEditors: "desktop:list-editors",
  openInEditor: "desktop:open-in-editor",
  setNativeTheme: "desktop:set-native-theme",
  getUpdateState: "desktop:get-update-state",
  checkForUpdates: "desktop:check-for-updates",
  downloadUpdate: "desktop:download-update",
  installUpdate: "desktop:install-update",
  updateState: "desktop:update-state",
} as const;
