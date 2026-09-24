import {expect, test} from "@e2e/support/timeline-fixture";

for (const {axis, property} of [
  {axis: "y", property: "--scroll-fade-block"},
  {axis: "x", property: "--scroll-fade-inline"},
] as const) {
  test(`${axis}: scroll fades stay local without changing their appearance`, async ({page, timeline}) => {
    await timeline.openMainSession();

    // Exercise the shipped utilities without unrelated timeline/button animations.
    await page.evaluate((axis) => {
      const viewport = document.createElement("div");
      viewport.className = `scroll-fade-${axis}`;
      viewport.dataset.testid = "scroll-fade-sample";
      viewport.style.cssText = "position:fixed;inset:16px auto auto 16px;z-index:9999;width:256px;height:192px;overflow:auto;background:#202020";
      const content = document.createElement("div");
      content.style.cssText = `width:${axis === "x" ? "768px" : "100%"};height:${axis === "y" ? "768px" : "100%"};background:repeating-linear-gradient(45deg,#888 0 16px,#ddd 16px 32px)`;
      viewport.append(content);
      // Transparent fade edges must not expose the app's unrelated animations.
      const background = document.createElement("div");
      background.style.cssText = "position:fixed;inset:0;z-index:9999;background:#202020";
      background.append(viewport);
      document.body.append(background);
    }, axis);

    const viewport = page.getByTestId("scroll-fade-sample");
    const content = viewport.locator(":scope > div");
    await expect(content).toHaveCSS(property, "");
    const masks = new Set<string>();

    for (const offset of [0, 48, 768]) {
      await viewport.evaluate(
        async (element, {axis, offset}) => {
          element.scrollTo(axis === "x" ? {left: offset} : {top: offset});
          // Scroll-driven CSS animations sample after the scroll position changes.
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        },
        {axis, offset}
      );

      const mask = await viewport.evaluate((element) => getComputedStyle(element).maskImage);
      expect(mask).toContain("linear-gradient");
      masks.add(mask);
      const isolated = await viewport.screenshot();

      // Restore upstream inheritance as a same-browser visual reference.
      const upstream = await page.addStyleTag({content: `@property ${property} { syntax: "*"; inherits: true; }`});
      await expect(content).not.toHaveCSS(property, "");
      await expect(viewport).toHaveCSS("mask-image", mask);
      expect((await viewport.screenshot()).equals(isolated), `the ${axis} fade at offset ${offset} should be pixel-identical`).toBe(true);
      await upstream.evaluate((element) => {
        element.parentNode?.removeChild(element);
      });
      await expect(content).toHaveCSS(property, "");
    }

    expect(masks.size, "the fade should still respond to the scroll position").toBe(3);
  });
}
