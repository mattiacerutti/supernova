import {expect, test} from "@playwright/test";

const WINDOW_CONTROL_CALLS_KEY = "supernova-e2e-window-control-calls";

type WindowControlCall = "close" | "minimize" | "toggle-maximize";

test.beforeEach(async ({page}) => {
  await page.addInitScript((callsKey) => {
    const recordCall = (call: WindowControlCall): Promise<void> => {
      const calls = JSON.parse(localStorage.getItem(callsKey) ?? "[]") as WindowControlCall[];
      localStorage.setItem(callsKey, JSON.stringify([...calls, call]));
      return Promise.resolve();
    };

    window.desktopApi = {
      closeWindow: () => recordCall("close"),
      environment: "windows",
      minimizeWindow: () => recordCall("minimize"),
      openDirectory: () => Promise.resolve(),
      setNativeTheme: () => Promise.resolve(),
      toggleMaximizeWindow: () => recordCall("toggle-maximize"),
    };
  }, WINDOW_CONTROL_CALLS_KEY);
});

test("forwards Windows window controls to the desktop bridge", async ({page}) => {
  await page.goto("/");

  await page.getByRole("button", {name: "Minimize window"}).click();
  await page.getByRole("button", {name: "Maximize or restore window"}).click();
  await page.getByRole("button", {name: "Close window"}).click();

  await expect
    .poll(() => page.evaluate((callsKey) => JSON.parse(localStorage.getItem(callsKey) ?? "[]") as WindowControlCall[], WINDOW_CONTROL_CALLS_KEY))
    .toEqual(["minimize", "toggle-maximize", "close"]);
});

test("keeps Windows window controls available in settings", async ({page}) => {
  await page.goto("/settings/appearance");

  await expect(page.getByRole("group", {name: "Window controls"})).toBeVisible();
  await expect(page.getByRole("button", {name: "Minimize window"})).toBeVisible();
  await expect(page.getByRole("button", {name: "Maximize or restore window"})).toBeVisible();
  await expect(page.getByRole("button", {name: "Close window"})).toBeVisible();
});
