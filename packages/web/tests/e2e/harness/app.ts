import {expect} from "@playwright/test";
import type {Locator, Page} from "@playwright/test";

type FilePayload = Parameters<Locator["setInputFiles"]>[0] & {readonly name: string; readonly mimeType: string; readonly buffer: Buffer};

export class App {
  public readonly sidebar: Sidebar;
  public readonly composer: Composer;
  public readonly timeline: Timeline;

  public constructor(public readonly page: Page) {
    this.sidebar = new Sidebar(page);
    this.composer = new Composer(page);
    this.timeline = new Timeline(page);
  }

  public async openProject(path: string): Promise<Project> {
    await this.page.goto("/");
    await this.page.locator("aside").getByRole("button", {exact: true, name: "New project"}).first().click();
    const search = this.page.getByPlaceholder("Search folders");
    await search.fill(`${path}/`);
    await expect(this.page.getByRole("button", {name: "Open project path"})).toBeEnabled();
    await search.press("Enter");
    const project = new Project(this, path.split("/").at(-1)!);
    await project.startSession();
    return project;
  }

  public sessionTitle(): Locator {
    return this.page.locator("header").getByRole("heading");
  }

  public async reload(): Promise<void> {
    await this.page.reload();
    await expect(this.timeline.root.or(this.page.getByRole("heading", {name: /What should we build/})).first()).toBeVisible();
  }
}

export class Project {
  public constructor(
    private readonly app: App,
    public readonly name: string
  ) {}

  public async startSession(): Promise<void> {
    await this.app.page.getByRole("button", {exact: true, name: `New session in ${this.name}`}).click();
    await expect(this.app.page.getByRole("heading", {name: `What should we build in ${this.name}?`})).toBeVisible();
    await expect(this.app.composer.editor).toBeEditable();
  }
}

export class Sidebar {
  public readonly root: Locator;

  public constructor(private readonly page: Page) {
    this.root = page.locator("aside");
  }

  /** Not the project's own item, which contains its session list. */
  private sessionRows(): Locator {
    return this.root.getByRole("list", {name: /^Sessions in /}).locator(":scope > li");
  }

  public session(title: string): Locator {
    return this.sessionRows().filter({has: this.page.getByRole("button", {exact: true, name: `Chat actions for ${title}`})});
  }

  public async open(title: string): Promise<void> {
    await this.session(title).getByText(title, {exact: true}).click();
    await expect(this.page.locator("header").getByRole("heading", {name: title})).toBeVisible();
  }

  public async act(title: string, action: "Archive chat" | "Pin chat" | "Rename chat" | "Unpin chat"): Promise<void> {
    const row = this.session(title);
    await row.hover();
    await row.getByRole("button", {exact: true, name: `Chat actions for ${title}`}).click();
    // The menu this click opened; one closing from an earlier action may still be animating out.
    const menu = this.page
      .getByRole("menu")
      .filter({hasNot: this.page.locator("[data-ending-style]")})
      .last();
    await menu.getByRole("menuitem", {name: action}).click();
    await expect(menu).toBeHidden();
  }

  public async rename(title: string, next: string): Promise<void> {
    await this.act(title, "Rename chat");
    const input = this.root.getByRole("textbox", {name: "Session title"});
    await input.fill(next);
    await input.press("Enter");
    await expect(this.session(next)).toBeVisible();
  }

  public async titles(): Promise<string[]> {
    const labels = await this.sessionRows()
      .locator('[aria-label^="Chat actions for "]')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")!));
    return labels.map((label) => label.slice("Chat actions for ".length));
  }
}

export class Composer {
  public readonly editor: Locator;

  public constructor(private readonly page: Page) {
    this.editor = page.getByRole("textbox", {name: "Message"});
  }

  /** Types as a person does, key by key, so the editor's suggestion triggers fire. */
  public async type(text: string): Promise<void> {
    await this.editor.pressSequentially(text);
  }

  public async paste(content: {readonly text: string; readonly html?: string}): Promise<void> {
    await this.editor.evaluate((editor, {html, text}) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      if (html !== undefined) data.setData("text/html", html);
      editor.dispatchEvent(new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData: data}));
    }, content);
  }

  public suggestion(title: string): Locator {
    return this.page.getByRole("button", {name: new RegExp(`^${escapeRegExp(title)}\\b`)});
  }

  public async attach(file: FilePayload): Promise<void> {
    const chooser = this.page.waitForEvent("filechooser");
    await this.page.getByRole("button", {name: "Attach files"}).click();
    await (await chooser).setFiles(file);
  }

  public async submit(): Promise<void> {
    await this.page.getByRole("button", {name: "Send message"}).click();
  }

  public async send(text: string): Promise<void> {
    await expect(this.editor).toBeEditable();
    await this.editor.fill(text);
    await this.submit();
  }

  public async stop(): Promise<void> {
    await this.page.getByRole("button", {name: "Stop streaming"}).click();
    await expect(this.page.getByRole("button", {name: "Send message"})).toBeVisible();
  }

  public async command(name: "compact" | "redo" | "undo"): Promise<void> {
    await this.editor.fill(`/${name}`);
    await this.suggestion(name[0]!.toUpperCase() + name.slice(1)).click();
  }
}

export class Timeline {
  public readonly root: Locator;

  public constructor(page: Page) {
    this.root = page.getByLabel("Session timeline");
  }

  public text(text: string | RegExp): Locator {
    return this.root.getByText(text, {exact: typeof text === "string"});
  }

  public async expectExchange(...lines: readonly string[]): Promise<void> {
    for (const line of lines) await expect(this.text(line)).toHaveCount(1);
  }

  public async expandWork(summary: string): Promise<void> {
    await this.root
      .getByRole("button", {name: /^Worked for/})
      .last()
      .click();
    await this.root.getByRole("button", {name: summary}).click();
    await expect(this.root.getByRole("button", {name: summary})).toHaveAttribute("aria-expanded", "true");
  }

  public tool(title: RegExp): Locator {
    return this.root.getByRole("button", {name: title});
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
