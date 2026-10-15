# Changelog

All notable changes to this project are documented in this file.

## v1.0.0 - 2026-04-01

- Promoted ExecGo to a stable `v1` release line.
- Added broader automated test coverage across:
  - unit: configuration loading defaults and overrides
  - module: scheduler timeout runtime error semantics
  - module: jsonfile persistence and recovery behavior
  - integration: HTTP error branches and health version contract
- Added GitHub Actions workflows:
  - `.github/workflows/ci.yml` for root + submodule test runs on pushes and pull requests
  - `.github/workflows/release.yml` for tag-driven release verification, cross-platform builds, checksums, and GitHub release publishing
- Unified service health version response to a single source (`pkg/version.Current`) and set release version to `v1.0.0`.
- Updated version references in README and Chinese docs for health endpoint examples.
