from pathlib import Path


def test_semantic_release_uses_root_changelog():
    pyproject = Path("pyproject.toml").read_text(encoding="utf-8")

    assert 'changelog_file = "CHANGELOG.md"' in pyproject


def test_release_workflow_uses_release_docs_helper():
    workflow = Path(".github/workflows/release.yml").read_text(encoding="utf-8")

    assert "python -m utils.release_docs package-readme" in workflow
    assert "--changelog CHANGELOG.md" in workflow


def test_release_workflow_uploads_secbot_archives():
    workflow = Path(".github/workflows/release.yml").read_text(encoding="utf-8")

    assert "secbot-${{ matrix.name }}" in workflow
    assert "dist/secbot-${{ matrix.name }}.zip" in workflow


def test_docs_changelog_redirects_to_root_and_version_docs():
    docs_changelog = Path("docs/CHANGELOG.md").read_text(encoding="utf-8")

    assert "../CHANGELOG.md" in docs_changelog
    assert "releases/README.md" in docs_changelog
