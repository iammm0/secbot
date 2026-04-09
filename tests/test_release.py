from pathlib import Path


def test_semantic_release_uses_root_changelog():
    pyproject = Path("pyproject.toml").read_text(encoding="utf-8")

    assert 'changelog_file = "CHANGELOG.md"' in pyproject


def test_release_workflow_refreshes_version_docs():
    workflow = Path(".github/workflows/release.yml").read_text(encoding="utf-8")

    assert "python -m utils.release_docs version-docs" in workflow
    assert "--changelog CHANGELOG.md" in workflow
    assert "--output-dir docs/releases" in workflow


def test_release_workflow_builds_and_uploads_wheel():
    workflow = Path(".github/workflows/release.yml").read_text(encoding="utf-8")

    assert "publish-pypi" in workflow
    assert "python -m build" in workflow
    assert "twine upload" in workflow or "twine check" in workflow


def test_docs_changelog_redirects_to_root_and_version_docs():
    docs_changelog = Path("docs/CHANGELOG.md").read_text(encoding="utf-8")

    assert "../CHANGELOG.md" in docs_changelog
    assert "releases/README.md" in docs_changelog
