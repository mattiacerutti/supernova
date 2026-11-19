import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useSyncExternalStore} from "react";
import type {ListedSession, ProjectWindow, SessionsView} from "@supernova/contracts/services/sessions/services";
import {useMountEffect} from "@/hooks/use-mount-effect";
import type {RuntimeClient} from "@/runtime/client";
import {follow} from "@/runtime/references";
import {useRuntime} from "@/runtime/hooks/use-runtime";

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
  // A remount must not hide the project.
  count: number;
  loadingMore: boolean;
  error: string | undefined;
}

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
      void this.runtime.sessions.hideProject({projectPath}, context).catch(() => undefined);
    };
  }

  public loadMore(projectPath: string): void {
    const shown = this.shown.get(projectPath);
    if (!shown || !this.state(projectPath).hasMore || shown.loadingMore) return;
    shown.depth += shown.pageSize;
    shown.loadingMore = true;
    this.update(projectPath);
    void this.runtime.sessions.loadMore({projectPath, by: shown.pageSize}, context).finally(() => {
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
    try {
      await this.runtime.sessions.showProject({projectPath, depth: shown.depth}, context);
    } catch (cause) {
      if (this.shown.get(projectPath) !== shown) return;
      shown.error = cause instanceof Error ? cause.message : "Unable to load sessions.";
      this.update(projectPath);
    }
  }

  private receive(list: SessionsView): void {
    this.list = list;
    for (const projectPath of this.shown.keys()) {
      // A view the server recreated after a reconnect.
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
