# Release process

Supernova releases are published by the [Release workflow](../../.github/workflows/release.yml), manually for stable or nightly builds and on a schedule for nightlies.

The workflow creates a release-prep commit, builds desktop artifacts, and publishes a GitHub Release.

## Changelog

Add release notes under `## [Unreleased]` in the root [CHANGELOG.md](../../CHANGELOG.md) for user-facing, release-relevant changes. Internal cleanup, refactors, tests, and documentation-only changes need no entry unless they affect released behavior or release operations.

Read the unreleased section first and append to an existing subsection; never duplicate headers. Released version sections are immutable.

Use these sections:

- `### Breaking Changes`
- `### Added`
- `### Changed`
- `### Fixed`
- `### Removed`

When a stable-channel release is run, the workflow moves the current `## [Unreleased]` entries into a new version section, for example `## [0.1.0]`, and uses that section as the GitHub release notes.

Do not create the version section manually.

### Entry style

- Use one concise, product-facing sentence describing observable behavior, not implementation work or the wording of the request.
- Use plain past tense: `Added ...`, `Changed ...`, `Fixed ...`, or `Removed ...`. Add a second sentence only to explain important user or release impact.
- Mention technical details only when they are part of the user-facing surface, such as a command, setting, file type, provider, or platform.
- Write `Changed the sidebar to keep project actions visible while resizing the window`, not `Implemented requested sidebar refactor`.

Attribution:

- Internal issue fixes: `Fixed foo bar ([#123](https://github.com/mattiacerutti/supernova/issues/123))`
- External contributions: `Added feature X ([#456](https://github.com/mattiacerutti/supernova/pull/456) by [@username](https://github.com/username))`

## Version inputs

The workflow's inputs distinguish the release channel from its version:

- `channel`: `stable` or `nightly`
- `version`: the version for a stable release, for example `0.1.0` or `v0.1.0`; nightly versions are generated
- `prerelease`: whether to publish the GitHub Release as a prerelease
- `signed`: whether desktop signing is enabled; defaults to `true`

A leading `v` is optional. `v0.1.0` and `0.1.0` both publish tag `v0.1.0`.

Versions with suffixes, such as `0.1.0-beta.1`, are automatically treated as prereleases. Prereleases are not marked as GitHub's latest release.

## Release workflow

Stable automation prepares the changelog, workspace versions, and lockfile in a release-prep commit, verifies and builds that revision, then pushes it and publishes the release. Existing tags/releases are refused. The workflow and [release scripts](../../scripts/release) own the exact steps; do not manually duplicate preparation or overwrite published history.

Nightly releases use unreleased notes without promoting them into a version section or pushing the release-prep commit to the branch. They are prereleases, not GitHub's latest stable release.

## Release artifacts

Check the workflow's platform matrix and [Electron Builder configuration](../../apps/desktop/electron-builder.config.mjs) for current targets and formats. Published assets include updater metadata as well as installers/packages; a downloadable app alone does not prove the update path works.

## Manual checklist

Before running a release:

1. Confirm `main` is green in CI.
2. Confirm `CHANGELOG.md` has the release notes under `## [Unreleased]`.
3. Open GitHub Actions and run the `Release` workflow.
4. Choose the intended channel and enter the version for a stable release.
5. Set `prerelease` for a preview on the stable workflow; nightlies are always prereleases.
6. Leave `signed` enabled for production and verify signing actually occurred. Missing credentials can cause an unsigned fallback; build success is not proof of signing. Unsigned macOS builds cannot receive automatic updates.
7. Wait for the workflow to complete. For stable releases, confirm the release-prep commit reached the triggering branch.
8. Download and sanity-check the published artifacts, including installation, startup, and update metadata.
