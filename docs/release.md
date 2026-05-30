# Release Process

Supernova releases are published by the manual GitHub Actions workflow at `.github/workflows/release.yml`.

The workflow creates a release-prep commit, builds desktop artifacts, and publishes a GitHub Release.

## Changelog

Add release notes under `## [Unreleased]` in `CHANGELOG.md` as changes are made.

Use these sections:

- `### Breaking Changes`
- `### Added`
- `### Changed`
- `### Fixed`
- `### Removed`

When a release is run, the workflow moves the current `## [Unreleased]` entries into a new version section, for example `## [0.1.0]`, and uses that section as the GitHub release notes.

Do not create the version section manually.

## Version Inputs

The workflow has two inputs:

- `version`: the version to release, for example `0.1.0` or `v0.1.0`
- `prerelease`: whether to publish the GitHub Release as a prerelease

A leading `v` is optional. `v0.1.0` and `0.1.0` both publish tag `v0.1.0`.

Versions with suffixes, such as `0.1.0-beta.1`, are automatically treated as prereleases. Prereleases are not marked as GitHub's latest release.

## Release Workflow

The workflow performs these steps:

1. Validates the release version.
2. Fails if the tag or GitHub Release already exists.
3. Promotes `CHANGELOG.md` entries from `## [Unreleased]` into `## [x.y.z]`.
4. Updates workspace package versions to `x.y.z`.
5. Commits the changelog, package versions, and lockfile changes.
6. Runs `bun run lint`, `bun run typecheck`, and `bun run test`.
7. Builds desktop artifacts.
8. Publishes the GitHub Release with the changelog section as release notes.

## Release Artifacts

The workflow builds artifacts for:

- macOS arm64
- macOS x64
- Linux x64
- Windows x64

The exact files come from Electron Builder configuration in `apps/desktop/electron-builder.yml`. The release upload step includes installer/package files matching:

- `.dmg`
- `.zip`
- `.AppImage`
- `.deb`
- `.snap`
- `.exe`
- `.msi`

## Manual Checklist

Before running a release:

1. Confirm `main` is green in CI.
2. Confirm `CHANGELOG.md` has the release notes under `## [Unreleased]`.
3. Open GitHub Actions and run the `Release` workflow.
4. Enter the release version.
5. Set `prerelease` only for preview builds.
6. Wait for the workflow to complete.
7. Download and sanity-check the published artifacts.
