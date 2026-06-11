import type {Page} from "@playwright/test";
import type {E2eScenario} from "@e2e/scenarios/scenario";

declare global {
  interface Window {
    __supernovaE2EScenario?: E2eScenario;
  }
}

export async function configureE2eScenario(page: Page, scenario: E2eScenario): Promise<void> {
  await page.addInitScript((configuredScenario) => {
    window.__supernovaE2EScenario = configuredScenario;
  }, scenario);
}
