import type {DesktopEnvironment} from "@supernova/contracts/desktop/api";
import {expect, test} from "@e2e/support/timeline-fixture";

for (const environment of ["mac", "windows", "linux"] satisfies DesktopEnvironment[]) {
  test(`${environment}: streaming content is not wrapped in a backdrop-filter surface`, async ({page, timeline}) => {
    await page.addInitScript((environment) => {
      window.desktopApi = {
        environment,
        serverUrl: "http://127.0.0.1:4317",
        appVersion: "0.0.0",
        nightly: false,
        openDirectory: async () => {},
        setNativeTheme: async () => {},
        getUpdateState: async () => ({status: "idle", version: null, downloadPercent: null, message: null}),
        downloadUpdate: async () => {},
        installUpdate: async () => {},
        onUpdateState: () => () => {},
      };
      localStorage.setItem("supernova-appearance", JSON.stringify({state: {mode: "dark", translucentSidebar: true}, version: 0}));
    }, environment);

    await timeline.openMainSession();

    // A filter on a shell ancestor puts the whole streaming UI in a filtered surface.
    // Native vibrancy/acrylic supplies desktop blur without that extra render pass.
    const filteredAncestors = await page.getByLabel("Session timeline").evaluate((viewport) => {
      const filtered: string[] = [];
      for (let element: Element | null = viewport; element; element = element.parentElement) {
        const filter = getComputedStyle(element).backdropFilter;
        if (filter !== "none") filtered.push(`${element.tagName}: ${filter}`);
      }
      return filtered;
    });
    expect(filteredAncestors).toEqual([]);

    // Keep the native material visible rather than hiding the problem with an opaque window.
    if (environment !== "linux") {
      await expect(page.locator("html")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const shell = page.getByRole("main").locator(":scope > section");
      await expect(shell).toHaveCSS("background-color", /\/ 0\.72\)$/);
    }

    await timeline.sendMessage();
    await timeline.waitForLineGrowth(45);
    await timeline.completeMessage();
  });
}
