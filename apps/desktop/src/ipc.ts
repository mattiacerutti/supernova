export const DESKTOP_IPC_CHANNELS = {
  openDirectory: "desktop:open-directory",
  setNativeTheme: "desktop:set-native-theme",
  getUpdateState: "desktop:get-update-state",
  checkForUpdates: "desktop:check-for-updates",
  downloadUpdate: "desktop:download-update",
  installUpdate: "desktop:install-update",
  updateState: "desktop:update-state",
} as const;
