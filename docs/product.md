# Product

What Supernova is, who it is for, and why it exists.

## What is Supernova

Supernova is a remote-controllable agentic development environment built on Pi. Pi provides the agent execution foundation; Supernova adds an opinionated workflow and product layer around it.

Calling Supernova a GUI for Pi is useful shorthand, but incomplete. Supernova does not only display Pi through a different interface. It adds server-owned remote sessions, committed/live state, Git-backed checkpoint navigation, project organization, structured messages, and explicit recovery behavior. These capabilities change how agent work is controlled and recovered, not only how it is presented.

The desktop and browser clients turn sessions, reasoning, tools, diffs, context, models, and checkpoints into one coherent workspace. Pi remains the engine underneath that experience rather than the boundary of what Supernova can provide.

The project is intentionally opinionated and is not designed for every agent workflow. It favors focused tools, explicit state, and engineering control over an all-in-one “vibe coding” surface. Agents accelerate the work; they do not replace review, product judgment, or responsibility for the result.

The project is pre-release. This document describes current product direction and behavior, not a compatibility promise or roadmap.

## Core philosophy

### Quality still matters

Supernova is for people who use agents but still care about the product they are building. Generated code is work to understand, review, test, and refine—not an opaque result to accept because it appeared quickly.

The interface keeps assistant output, reasoning, tool activity, file changes, failures, and context visible. Checkpoint navigation makes experimentation reversible so users can move quickly without giving up control of the conversation or workspace.

### Minimal by choice

Supernova is not trying to become an everything platform. A feature must improve a real agentic coding workflow enough to justify its complexity, interface weight, and maintenance cost.

Minimalism here means fewer concepts, fewer competing workflows, and less chrome, not fewer safeguards. Reliability, checkpointing, failure states, and recovery remain first-class because removing them would make the product simpler only on the surface.

### Pi under the hood

Pi is one of the strongest agent harnesses available. Supernova uses it as an execution engine instead of rebuilding one.

Provider protocols, model execution, durable session storage, resource loading, and coding tools remain Pi responsibilities. Supernova builds above that foundation: remote runtime ownership, committed/live session behavior, Git-backed checkpoint navigation, project workflows, recovery policy, and the graphical interaction model.

The boundary is deliberate. Supernova should reuse Pi wherever Pi already owns the problem, then add product behavior where an opinionated development environment needs stronger workflow guarantees.

### Remote control is architectural

Remote control is not a desktop feature added later. Supernova is client-server from the beginning:

- the server owns Pi, sessions, credentials, filesystem access, subprocesses, and Git checkpoints
- browser and Electron clients observe and control that server over typed WebSocket RPC
- accepted work continues when a client changes routes, reloads, or disconnects
- filesystem paths always refer to the machine running the server

The same model works when the client and server share a machine or are separated by a trusted network boundary.

### Speed is a product feature

Long sessions, rapid streams, code rendering, and project navigation must remain responsive. Performance is measured against realistic agent sessions and treated as a product requirement, not an optimization pass after the workflow is built. A fast empty screen is not the target.

### Details are part of the feature

Supernova should look and feel considered. Scroll behavior, keyboard and pointer interaction, loading and failure states, typography, spacing, transitions, and native window behavior are part of the product contract.

Visual quality is not decoration applied after the workflow works. The interface should make dense agent activity calm, readable, and easy to control.

## Why use Supernova

- **Pi as a foundation, not a UI constraint** — Use Pi's harness, providers, models, sessions, and tools inside a broader development workflow with remote control, Git checkpoints, and explicit recovery.
- **Fast session work** — Navigate projects and long-running streams without the interface degrading as history grows.
- **A polished development surface** — Read messages, reasoning, tool activity, code, and diffs in an interface designed for sustained use.
- **Remote control by design** — Run the agent and project environment on one machine and control them from a browser or desktop client without transferring execution ownership to the client.
- **Full checkpoint navigation** — Undo, redo, or revert conversation turns. In Git projects, private checkpoint snapshots also restore the files changed between turns without moving `HEAD`, resetting staged changes, or disturbing stash entries.
- **Opinionated restraint** — Get the workflow Supernova believes in instead of a growing collection of loosely related agent features and configuration.

## How it works

### Projects

A project is a client-owned record for one exact directory on the server machine. Projects are grouped in a resizable sidebar and expanded to show Pi sessions whose working directory matches that path.

Users can browse and create server-host folders, organize projects locally, search sessions, and see activity from sessions running in the background. Project organization and pinning live in the browser or Electron profile; the server does not maintain a synchronized project registry.

### Sessions

A session combines three primary surfaces:

- **Timeline** — Committed history and the active live turn appear as one transcript. Assistant text, reasoning, tool calls, command output, file diffs, compaction, and errors retain distinct presentation.
- **Composer** — Structured text, `@` project paths, `$` `.agents` skills, text and image attachments, model selection, thinking level, context usage, and send/stop controls live in one surface.
- **Checkpoints** — Conversation history can move backward and forward. Git projects also receive private workspace snapshots around accepted turns.

Long transcripts are virtualized. Following new output and preserving a deliberately detached reading position are explicit behaviors, including during settlement, abort, route changes, and checkpoint navigation.

Different sessions can run concurrently. One session accepts one mutating command at a time.

### Providers and models

Pi's model runtime is the authority for providers, authentication, and available models. Supernova presents provider-defined OAuth and API-key flows, distinguishes Pi-stored credentials from externally managed credentials, and lets users select currently available models and supported thinking levels.

Supernova adapts this state into one consistent interface; it does not implement provider protocols.

### Desktop and browser

The standalone server serves the browser client and WebSocket RPC. The Electron app packages that same server and client, then adds native window chrome, persisted geometry, host-path opening, shell-environment import, icons, and managed server lifecycle.

Electron is an operating-system shell, not a second agent runtime. Browser behavior remains independent of Electron-only capabilities.

## Target user

Supernova is for developers who:

- already use or want to use Pi but prefer a graphical workspace to a TUI
- use agents on real codebases and still review, test, and take responsibility for the result
- care about product quality, not only the speed at which code can be generated
- want to inspect reasoning, tools, diffs, context, and failures as work happens
- need to monitor or control server-owned agent work from another client
- want checkpoint-backed experimentation without surrendering their existing Git state
- prefer a compact, deliberate workflow over broad “vibe coding” feature accumulation

It is a poor fit for users looking for a no-code product generator, an autonomous system that removes engineering judgment, or a fully configurable replacement for every development tool.
