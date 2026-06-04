# Changelog

All notable changes to Supernova are documented in this file.

## [Unreleased]

### Breaking Changes

### Added

### Changed

- Improved session work duration labels to show hours, minutes, and seconds.

### Fixed

- Fixed checkpoint navigation leaking undone messages into the agent's provider context.
- Fixed composer and sent-message references adding unintended visual spacing around adjacent text.
- Fixed the desktop app resetting its window size and position after reopening.

### Removed

## [0.0.1-alpha.5]

### Added

- Added spring interaction for session pin icons when sessions are pinned or unpinned.

### Changed

- Added the app icon above the new chat prompt and improved styling.
- Allowed interactive with the message composer while a session is streaming.
- Made checkpoint undo and redo restore only checkpoint-changed worktree files without moving Git history or resetting staged changes.

### Fixed

- Fixed read tool line range labels to display the ending line relative to the starting offset.
- Fixed the session UI getting stuck when reverting messages after stopping an in-progress response.
- Fixed duplicate user messages appearing after refocusing the app while an agent response is streaming.

## [0.0.1-alpha.4]

### Added

- Added a projects sidebar action for collapsing all expanded projects.

### Changed

- Reworked provider OAuth login into a streamed, step-based flow with support for device-code or browser login.

### Fixed

- Removed display of partial tool-call arguments during streaming.
- Fixed command execution in the packaged desktop app so agents can find tools installed in the user's shell environment.
- Fixed the packaged desktop app forgetting opened projects, model preferences, and other local UI settings after restarting.

## [0.0.1-alpha.3]

### Breaking Changes

- Separated Supernova dev and production runtime state under `~/.supernova/dev` and `~/.supernova/userdata`, including Pi sessions, auth, and settings.

### Changed

- Split desktop icon generation into dev and production source sets.

## [0.0.1-alpha.2]

### Breaking Changes

### Added

### Changed

### Fixed

- Fixed macOS desktop packaging so unsigned alpha builds can launch correctly.

### Removed

## [0.0.1-alpha.1]

### Breaking Changes

### Added

- Initial alpha release of the Supernova desktop agent UI.

### Changed

### Fixed

### Removed
