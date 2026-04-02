"""Helpers for release notes generation and versioned release docs."""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT_CHANGELOG_PATTERN = re.compile(
    r"^## v(?P<version>[0-9A-Za-z.\-_]+)\s+\((?P<date>[^)]+)\)\s*$",
    re.MULTILINE,
)
LEGACY_CHANGELOG_PATTERN = re.compile(
    r"^## \[(?P<version>[0-9A-Za-z.\-_]+)\]\s+-\s+(?P<date>[^\n]+)\s*$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class ReleaseEntry:
    version: str
    date: str
    body: str

    @property
    def tag(self) -> str:
        return f"v{self.version}"


def _extract_entries(text: str, pattern: re.Pattern[str]) -> list[ReleaseEntry]:
    matches = list(pattern.finditer(text))
    entries: list[ReleaseEntry] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        entries.append(
            ReleaseEntry(
                version=match.group("version").strip(),
                date=match.group("date").strip(),
                body=body,
            )
        )
    return entries


def parse_changelog_text(text: str) -> list[ReleaseEntry]:
    """Parse either the current root changelog or the legacy docs format."""
    entries = _extract_entries(text, ROOT_CHANGELOG_PATTERN)
    if entries:
        return entries
    return _extract_entries(text, LEGACY_CHANGELOG_PATTERN)


def parse_changelog_file(path: str | Path) -> list[ReleaseEntry]:
    return parse_changelog_text(Path(path).read_text(encoding="utf-8"))


def find_release(entries: Iterable[ReleaseEntry], version: str) -> ReleaseEntry | None:
    normalized = version.removeprefix("v")
    for entry in entries:
        if entry.version == normalized:
            return entry
    return None


def render_release_body(entry: ReleaseEntry) -> str:
    body = entry.body.strip()
    if body:
        return body
    return "_No curated release notes were recorded for this version. Check the commit history for details._"


def render_package_readme(
    *,
    project_name: str,
    entry: ReleaseEntry | None,
    version_label: str,
    platform_name: str,
    build_time: str,
) -> str:
    lines = [
        f"# {project_name} {version_label}",
        "",
        f"Platform: {platform_name}",
        f"Build: {build_time}",
        "",
    ]
    if entry is not None:
        lines.extend(
            [
                f"Release date: {entry.date}",
                "",
                "## Release Notes",
                "",
                render_release_body(entry),
                "",
            ]
        )
    else:
        lines.extend(
            [
                "## Release Notes",
                "",
                "_No matching changelog entry was found for this build._",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_release_doc(entry: ReleaseEntry) -> str:
    return "\n".join(
        [
            f"# {entry.tag}",
            "",
            f"- Release date: {entry.date}",
            f"- Git tag: `{entry.tag}`",
            "",
            "## Summary",
            "",
            render_release_body(entry),
            "",
        ]
    )


def write_package_readme(
    *,
    changelog_path: str | Path,
    version: str,
    platform_name: str,
    output_path: str | Path,
    project_name: str = "Secbot",
    build_time: str | None = None,
) -> Path:
    entries = parse_changelog_file(changelog_path)
    entry = find_release(entries, version)
    version_label = version if version.startswith("v") else f"v{version}"
    resolved_build_time = build_time or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        render_package_readme(
            project_name=project_name,
            entry=entry,
            version_label=version_label,
            platform_name=platform_name,
            build_time=resolved_build_time,
        ),
        encoding="utf-8",
    )
    return output


def write_version_docs(
    *,
    changelog_path: str | Path,
    output_dir: str | Path,
) -> list[Path]:
    entries = parse_changelog_file(changelog_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    written: list[Path] = []
    for entry in entries:
        doc_path = out_dir / f"{entry.tag}.md"
        doc_path.write_text(render_release_doc(entry), encoding="utf-8")
        written.append(doc_path)

    index_lines = [
        "# Release Notes",
        "",
        "Version-specific release notes generated from the repository changelog.",
        "",
    ]
    for entry in entries:
        index_lines.append(f"- [{entry.tag}]({entry.tag}.md) - {entry.date}")
    index_lines.append("")

    index_path = out_dir / "README.md"
    index_path.write_text("\n".join(index_lines), encoding="utf-8")
    written.append(index_path)
    return written


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate release documentation from changelog entries.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    package_parser = subparsers.add_parser("package-readme", help="Create README_RELEASE.md for packaged builds.")
    package_parser.add_argument("--changelog", required=True)
    package_parser.add_argument("--version", required=True)
    package_parser.add_argument("--platform", required=True)
    package_parser.add_argument("--output", required=True)
    package_parser.add_argument("--project-name", default="Secbot")
    package_parser.add_argument("--build-time")

    docs_parser = subparsers.add_parser("version-docs", help="Generate docs/releases markdown files.")
    docs_parser.add_argument("--changelog", required=True)
    docs_parser.add_argument("--output-dir", required=True)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "package-readme":
        write_package_readme(
            changelog_path=args.changelog,
            version=args.version,
            platform_name=args.platform,
            output_path=args.output,
            project_name=args.project_name,
            build_time=args.build_time,
        )
        return 0

    if args.command == "version-docs":
        write_version_docs(changelog_path=args.changelog, output_dir=args.output_dir)
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
