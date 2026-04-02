# Release Guide

This repository now uses a single release source of truth:

- Root changelog: [../CHANGELOG.md](../CHANGELOG.md)
- Version docs: [releases/README.md](releases/README.md)
- Workflow: [../.github/workflows/release.yml](../.github/workflows/release.yml)

## User-facing Releases

Download packaged builds from [GitHub Releases](https://github.com/iammm0/secbot/releases).

Current release archives are named `secbot-<platform>.zip`. Inside the archive, the executable may still use the legacy `hackbot` binary name because the PyInstaller spec is still `hackbot.spec`.

Typical extracted binaries:

- Windows: `hackbot.exe`
- Linux / macOS: `hackbot`

Create a `.env` file next to the executable before first launch. Minimal examples:

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner
```

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Run the packaged binary:

- Windows: `hackbot.exe`
- Linux / macOS: `chmod +x hackbot && ./hackbot`

## Maintainer Flow

Release metadata is sourced from:

- `pyproject.toml` for the package version
- `CHANGELOG.md` for human-readable release notes

`python-semantic-release` is configured in [../pyproject.toml](../pyproject.toml) and runs from the `main` and `beta` branches. The GitHub Actions workflow:

1. Computes whether a release should be created.
2. Builds platform packages with `uv` and PyInstaller.
3. Generates `README_RELEASE.md` inside the packaged artifact from `CHANGELOG.md`.
4. Uploads `secbot-<platform>.zip` files to the GitHub release.

## Local Release Tasks

Install dependencies:

```bash
uv sync
uv pip install pyinstaller
```

Build the packaged application:

```bash
uv run python -m PyInstaller hackbot.spec
```

Generate versioned release docs from the root changelog:

```bash
python -m utils.release_docs version-docs --changelog CHANGELOG.md --output-dir docs/releases
```

Generate a packaged release README manually:

```bash
python -m utils.release_docs package-readme \
  --changelog CHANGELOG.md \
  --version v1.8.0 \
  --platform windows-amd64 \
  --output dist/hackbot/README_RELEASE.md
```

## Notes

- There is no root `.env.example` yet, so release docs intentionally embed copyable `.env` snippets.
- `pip install .` and GitHub Release artifacts do not provide the exact same runtime surface. The packaged release remains the best path for an out-of-the-box terminal experience.
- The release archive name is now `secbot-*`, while the bundled executable still uses the historical `hackbot` name until the PyInstaller spec is renamed.
