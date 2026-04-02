from pathlib import Path

from utils.release_docs import (
    ReleaseEntry,
    find_release,
    parse_changelog_text,
    render_release_body,
    write_package_readme,
    write_version_docs,
)


def test_parse_root_changelog_format():
    entries = parse_changelog_text(
        "# CHANGELOG\n\n## v1.2.0 (2026-04-01)\n\n### Features\n\n- Added thing\n\n## v1.1.0 (2026-03-01)\n\n- Older\n"
    )

    assert [entry.version for entry in entries] == ["1.2.0", "1.1.0"]
    assert entries[0].date == "2026-04-01"
    assert "Added thing" in entries[0].body


def test_parse_legacy_changelog_format():
    entries = parse_changelog_text(
        "# Changelog\n\n## [1.2.0] - 2026-04-01\n\n### Changed\n\n- Added thing\n"
    )

    assert len(entries) == 1
    assert entries[0].version == "1.2.0"
    assert entries[0].date == "2026-04-01"


def test_find_release_accepts_prefixed_version():
    entries = [ReleaseEntry(version="1.2.0", date="2026-04-01", body="- Added thing")]

    match = find_release(entries, "v1.2.0")

    assert match == entries[0]


def test_render_release_body_handles_empty_content():
    body = render_release_body(ReleaseEntry(version="1.2.0", date="2026-04-01", body=""))

    assert "No curated release notes" in body


def test_write_package_readme_uses_matching_version(tmp_path: Path):
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text("# CHANGELOG\n\n## v1.2.0 (2026-04-01)\n\n- Added thing\n", encoding="utf-8")
    output = tmp_path / "dist" / "README_RELEASE.md"

    write_package_readme(
        changelog_path=changelog,
        version="1.2.0",
        platform_name="windows-amd64",
        output_path=output,
        build_time="2026-04-02T00:00:00Z",
    )

    content = output.read_text(encoding="utf-8")
    assert "# Secbot v1.2.0" in content
    assert "windows-amd64" in content
    assert "Added thing" in content


def test_write_version_docs_creates_index_and_version_files(tmp_path: Path):
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(
        "# CHANGELOG\n\n## v1.2.0 (2026-04-01)\n\n- Added thing\n\n## v1.1.0 (2026-03-01)\n\n- Older thing\n",
        encoding="utf-8",
    )

    written = write_version_docs(changelog_path=changelog, output_dir=tmp_path / "docs" / "releases")

    assert (tmp_path / "docs" / "releases" / "v1.2.0.md").exists()
    assert (tmp_path / "docs" / "releases" / "README.md").exists()
    assert any(path.name == "README.md" for path in written)
