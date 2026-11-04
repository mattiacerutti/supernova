import {useSyncExternalStore} from "react";
import type {ListedSession, ProjectWindow, SessionsView} from "@supernova/contracts/services/sessions/services";
import {useMountEffect} from "@/hooks/use-mount-effect";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {follow} from "@/runtime/transport/follow";
import {useRuntime} from "@/runtime/use-runtime";

export interface ProjectListState {
  readonly items: readonly ListedSession[];
  readonly hasMore: boolean;
  readonly pending: boolean;
  readonly loadingMore: boolean;
  readonly error: string | undefined;
  readonly expanded: boolean;
}

const PENDING: ProjectListState = {items: [], hasMore: false, pending: true, loadingMore: false, error: undefined, expanded: false};

interface Shown {
  depth: number;
  readonly pageSize: number;
  /** Rows showing the project: a remount must not hide it. */
  count: number;
  loadingMore: boolean;
  error: string | undefined;
}

/** Keeps what it asked for, so a view the server recreated after a reconnect is asked again. */
export class SessionListView {
  private readonly listeners = new Set<() => void>();
  private readonly shown = new Map<string, Shown>();
  private readonly states = new Map<string, ProjectListState>();
  private list: SessionsView = {projects: {}, open: null};
  private started = false;

  public constructor(private readonly runtime: RuntimeClient) {}

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The same object while nothing changed, as `useSyncExternalStore` needs. */
  public state(projectPath: string): ProjectListState {
    return this.states.get(projectPath) ?? PENDING;
  }

  public show(projectPath: string, pageSize: number): () => void {
    this.start();
    const existing = this.shown.get(projectPath);
    if (existing) existing.count += 1;
    else {
      this.shown.set(projectPath, {depth: pageSize, pageSize, count: 1, loadingMore: false, error: undefined});
      void this.send(projectPath);
    }
    return () => {
      const shown = this.shown.get(projectPath);
      if (!shown || --shown.count > 0) return;
      this.shown.delete(projectPath);
      this.states.delete(projectPath);
      void this.runtime.sessions.hideProject({projectPath});
    };
  }

  public loadMore(projectPath: string): void {
    const shown = this.shown.get(projectPath);
    if (!shown || !this.state(projectPath).hasMore || shown.loadingMore) return;
    shown.depth += shown.pageSize;
    shown.loadingMore = true;
    this.update(projectPath);
    void this.runtime.sessions.loadMore({projectPath, by: shown.pageSize}).finally(() => {
      shown.loadingMore = false;
      this.update(projectPath);
    });
  }

  public showFirstPage(projectPath: string): void {
    const shown = this.shown.get(projectPath);
    if (!shown) return;
    shown.depth = shown.pageSize;
    void this.send(projectPath);
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    follow(this.runtime.sessions.view, (view) => this.receive(view));
  }

  private async send(projectPath: string): Promise<void> {
    const shown = this.shown.get(projectPath);
    if (!shown) return;
    const result = await this.runtime.sessions
      .showProject({projectPath, depth: shown.depth})
      .catch((cause: unknown) => ({ok: false as const, error: {message: cause instanceof Error ? cause.message : "Unable to load sessions."}}));
    if (result.ok || this.shown.get(projectPath) !== shown) return;
    shown.error = result.error.message;
    this.update(projectPath);
  }

  private receive(list: SessionsView): void {
    this.list = list;
    for (const projectPath of this.shown.keys()) {
      // A list the server recreated (dropped after a reconnect) lacks what this tab shows: ask again.
      if (!list.projects[projectPath]) void this.send(projectPath);
      else this.update(projectPath);
    }
  }

  private update(projectPath: string): void {
    const shown = this.shown.get(projectPath);
    if (!shown) return;
    const window: ProjectWindow | undefined = this.list.projects[projectPath];
    const previous = this.state(projectPath);
    const next: ProjectListState = {
      items: window?.items ?? previous.items,
      hasMore: window?.hasMore ?? false,
      pending: window === undefined || (window.loading && previous.pending),
      loadingMore: shown.loadingMore,
      error: shown.error,
      expanded: shown.depth > shown.pageSize,
    };
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    this.states.set(projectPath, next);
    for (const listener of [...this.listeners]) listener();
  }
}

const views = new WeakMap<RuntimeClient, SessionListView>();

function viewOf(runtime: RuntimeClient): SessionListView {
  let view = views.get(runtime);
  if (!view) {
    view = new SessionListView(runtime);
    views.set(runtime, view);
  }
  return view;
}

export function useProjectList(projectPath: string, pageSize: number): ProjectListState & {readonly view: SessionListView} {
  const view = viewOf(useRuntime());
  useMountEffect(() => view.show(projectPath, pageSize));
  const state = useSyncExternalStore(view.subscribe, () => view.state(projectPath));
  return {...state, view};
}
