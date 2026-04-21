"""依赖漏洞审计工具：解析项目依赖文件，查询已知漏洞"""
import asyncio
import json
import re
from pathlib import Path
from typing import Any, Dict, List
from urllib.request import Request, urlopen
from tools.base import BaseTool, ToolResult

# 支持的依赖文件格式（文件名 -> 解析函数名）
SUPPORTED_FILES = {
    "requirements.txt": "_parse_requirements_txt",
    "pipfile": "_parse_pipfile",
    "pipfile.lock": "_parse_pipfile_lock",
    "poetry.lock": "_parse_poetry_lock",
    "pyproject.toml": "_parse_pyproject_toml",
    "setup.py": "_parse_setup_py",
    "setup.cfg": "_parse_setup_cfg",
    "package.json": "_parse_package_json",
    "package-lock.json": "_parse_package_lock_json",
    "yarn.lock": "_parse_yarn_lock",
    "pnpm-lock.yaml": "_parse_pnpm_lock",
    "pom.xml": "_parse_pom_xml",
    "build.gradle": "_parse_gradle",
    "build.gradle.kts": "_parse_gradle",
    "cargo.toml": "_parse_cargo_toml",
    "cargo.lock": "_parse_cargo_lock",
    "go.mod": "_parse_go_mod",
    "go.sum": "_parse_go_sum",
    "gemfile": "_parse_gemfile",
    "gemfile.lock": "_parse_gemfile_lock",
    "composer.json": "_parse_composer_json",
    "composer.lock": "_parse_composer_lock",
}


class DependencyAuditTool(BaseTool):
    """依赖漏洞审计工具（使用 OSV API）"""

    sensitivity = "low"

    OSV_API_URL = "https://api.osv.dev/v1/query"

    def __init__(self):
        super().__init__(
            name="dependency_audit",
            description=(
                "扫描项目依赖文件（requirements.txt / package.json / pom.xml / Cargo.toml / go.mod 等），"
                "通过 OSV 数据库查询已知漏洞。"
                "参数: path(项目目录或依赖文件路径), type(python/node/java/rust/go/php/ruby, 可选自动检测)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        path_str = kwargs.get("path", "").strip()
        dep_type = kwargs.get("type", "").strip().lower()

        if not path_str:
            return ToolResult(success=False, result=None, error="缺少参数: path")

        target = Path(path_str)
        if not target.exists():
            return ToolResult(success=False, result=None, error=f"路径不存在: {path_str}")

        # 查找依赖文件
        deps = self._parse_dependencies(target, dep_type)
        if not deps:
            return ToolResult(
                success=False, result=None,
                error=(
                    "未找到依赖文件或无法解析。支持的格式: requirements.txt, Pipfile, pyproject.toml, "
                    "package.json, pom.xml, build.gradle, Cargo.toml, go.mod, Gemfile, composer.json 等"
                ),
            )

        # 查询 OSV 漏洞
        loop = asyncio.get_event_loop()
        vulnerabilities = []
        scanned = 0

        for dep in deps:
            scanned += 1
            try:
                vulns = await loop.run_in_executor(
                    None,
                    self._query_osv,
                    dep["name"],
                    dep.get("version", ""),
                    dep["ecosystem"],
                )
                if vulns:
                    vulnerabilities.append({
                        "package": dep["name"],
                        "version": dep.get("version", "未指定"),
                        "ecosystem": dep["ecosystem"],
                        "vulnerabilities": vulns,
                    })
            except Exception:
                pass

        total_vulns = sum(len(v["vulnerabilities"]) for v in vulnerabilities)

        return ToolResult(
            success=True,
            result={
                "path": path_str,
                "packages_scanned": scanned,
                "vulnerable_packages": len(vulnerabilities),
                "total_vulnerabilities": total_vulns,
                "details": vulnerabilities[:30],
                "risk_level": "high" if total_vulns > 0 else "low",
            },
        )

    def _find_dep_files(self, target: Path, dep_type: str, max_depth: int = 3) -> List[Path]:
        """查找依赖文件（支持递归，限制深度避免扫描过大）"""
        found: List[Path] = []
        if target.is_file():
            if target.name.lower() in SUPPORTED_FILES:
                return [target]
            return []

        def scan(dir_path: Path, depth: int) -> None:
            if depth > max_depth:
                return
            try:
                for p in dir_path.iterdir():
                    if p.is_file():
                        if p.name.lower() in SUPPORTED_FILES:
                            found.append(p)
                    elif p.is_dir() and not p.name.startswith(".") and p.name not in ("node_modules", "venv", "__pycache__", "target", "dist", "build"):
                        scan(p, depth + 1)
            except PermissionError:
                pass

        scan(target, 0)
        return found

    def _parse_dependencies(self, target: Path, dep_type: str) -> List[Dict]:
        """解析依赖文件"""
        deps: List[Dict] = []
        seen: set = set()

        files = self._find_dep_files(target, dep_type)
        for fpath in files:
            name = fpath.name.lower()
            parser_name = SUPPORTED_FILES.get(name)
            if not parser_name or not hasattr(self, parser_name):
                continue
            try:
                parsed = getattr(self, parser_name)(fpath)
                for p in parsed:
                    key = (p.get("name"), p.get("ecosystem", ""))
                    if key not in seen:
                        seen.add(key)
                        deps.append(p)
            except Exception:
                pass

        return deps

    def _parse_requirements_txt(self, fpath: Path) -> List[Dict]:
        """解析 requirements.txt"""
        deps = []
        content = fpath.read_text(encoding="utf-8", errors="ignore")
        for line in content.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            # 解析 package==version 或 package>=version
            match = re.match(r"^([A-Za-z0-9_\-\.]+)\s*([=<>!~]+)\s*([^\s;#,]+)", line)
            if match:
                deps.append({
                    "name": match.group(1),
                    "version": match.group(3),
                    "ecosystem": "PyPI",
                })
            else:
                # 无版本号
                pkg = re.match(r"^([A-Za-z0-9_\-\.]+)", line)
                if pkg:
                    deps.append({
                        "name": pkg.group(1),
                        "ecosystem": "PyPI",
                    })
        return deps

    def _parse_pipfile(self, fpath: Path) -> List[Dict]:
        """简单解析 Pipfile"""
        deps = []
        content = fpath.read_text(encoding="utf-8", errors="ignore")
        in_packages = False
        for line in content.split("\n"):
            line = line.strip()
            if line == "[packages]" or line == "[dev-packages]":
                in_packages = True
                continue
            if line.startswith("["):
                in_packages = False
                continue
            if in_packages and "=" in line:
                name = line.split("=")[0].strip().strip('"')
                if name:
                    deps.append({"name": name, "ecosystem": "PyPI"})
        return deps

    def _parse_package_json(self, fpath: Path) -> List[Dict]:
        """解析 package.json"""
        deps = []
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
            for section in ["dependencies", "devDependencies", "optionalDependencies"]:
                for name, version in data.get(section, {}).items():
                    ver = re.sub(r"^[\^~>=<]+", "", str(version))
                    deps.append({"name": name, "version": ver, "ecosystem": "npm"})
        except Exception:
            pass
        return deps

    def _parse_package_lock_json(self, fpath: Path) -> List[Dict]:
        """解析 package-lock.json"""
        deps = []
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
            packages = data.get("packages", data.get("dependencies", {}))
            for key, pkg in packages.items():
                if key.startswith("node_modules/"):
                    name = key.split("/")[-1]
                else:
                    name = key
                if name and not name.startswith("."):
                    ver = pkg.get("version", "") if isinstance(pkg, dict) else str(pkg)
                    deps.append({"name": name, "version": ver, "ecosystem": "npm"})
        except Exception:
            pass
        return deps

    def _parse_yarn_lock(self, fpath: Path) -> List[Dict]:
        """解析 yarn.lock"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r'"([^"]+@[^"]+)"\s*:\s*version\s*"([^"]+)"', content):
                name = m.group(1).split("@")[0]
                deps.append({"name": name, "version": m.group(2), "ecosystem": "npm"})
        except Exception:
            pass
        return deps

    def _parse_pnpm_lock(self, fpath: Path) -> List[Dict]:
        """解析 pnpm-lock.yaml"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r"/([^/]+)@[^\s:]+:\s*\n\s+version:\s*['\"]?([^'\s\n]+)", content):
                deps.append({"name": m.group(1), "version": m.group(2), "ecosystem": "npm"})
        except Exception:
            pass
        return deps

    def _parse_pipfile_lock(self, fpath: Path) -> List[Dict]:
        """解析 Pipfile.lock"""
        deps = []
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
            for section in ("default", "develop"):
                for name, info in data.get(section, {}).items():
                    ver = info.get("version", "").lstrip("==") if isinstance(info, dict) else ""
                    deps.append({"name": name, "version": ver, "ecosystem": "PyPI"})
        except Exception:
            pass
        return deps

    def _parse_poetry_lock(self, fpath: Path) -> List[Dict]:
        """解析 poetry.lock"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            in_section = False
            for line in content.split("\n"):
                if line.strip() == "[[package]]":
                    in_section = True
                    name = version = ""
                    continue
                if in_section:
                    if line.startswith("name = "):
                        name = line.split("=", 1)[1].strip().strip('"')
                    elif line.startswith("version = "):
                        version = line.split("=", 1)[1].strip().strip('"')
                    elif line.strip() == "" and name:
                        deps.append({"name": name, "version": version, "ecosystem": "PyPI"})
                        in_section = False
        except Exception:
            pass
        return deps

    def _parse_pyproject_toml(self, fpath: Path) -> List[Dict]:
        """解析 pyproject.toml"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            in_deps = False
            for line in content.split("\n"):
                stripped = line.strip()
                if stripped in ("[tool.poetry.dependencies]", "[dependencies]"):
                    in_deps = True
                    continue
                if stripped == "[project]" or stripped.startswith("dependencies"):
                    in_deps = True
                    if "[" in line:
                        for m in re.finditer(r'["\']([a-zA-Z0-9_-]+)', line):
                            deps.append({"name": m.group(1), "ecosystem": "PyPI"})
                    continue
                if stripped.startswith("[") and in_deps:
                    in_deps = False
                    continue
                if in_deps and not stripped.startswith("#"):
                    for m in re.finditer(r'["\']([a-zA-Z0-9_.-]+)', stripped):
                        pkg = m.group(1).split("=")[0].split("[")[0].strip()
                        if len(pkg) > 1 and pkg != "python":
                            deps.append({"name": pkg, "ecosystem": "PyPI"})
        except Exception:
            pass
        return deps

    def _parse_setup_py(self, fpath: Path) -> List[Dict]:
        """解析 setup.py（简单提取 install_requires）"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"install_requires\s*=\s*\[(.*?)\]", content, re.DOTALL)
            if m:
                for p in re.findall(r'"([^"]+)"', m.group(1)):
                    deps.append({"name": p, "ecosystem": "PyPI"})
        except Exception:
            pass
        return deps

    def _parse_setup_cfg(self, fpath: Path) -> List[Dict]:
        """解析 setup.cfg"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            in_requires = False
            for line in content.split("\n"):
                if line.strip().startswith("install_requires"):
                    in_requires = True
                    continue
                if in_requires:
                    for p in re.findall(r"([a-zA-Z0-9_-]+)", line):
                        if len(p) > 2:
                            deps.append({"name": p, "ecosystem": "PyPI"})
                    break
        except Exception:
            pass
        return deps

    def _parse_pom_xml(self, fpath: Path) -> List[Dict]:
        """解析 pom.xml（Maven）"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r"<dependency>.*?<groupId>([^<]+)</groupId>.*?<artifactId>([^<]+)</artifactId>.*?(?:<version>([^<]*)</version>)?.*?</dependency>", content, re.DOTALL):
                group, artifact, version = m.group(1), m.group(2), (m.group(3) or "").strip()
                name = f"{group}:{artifact}"
                deps.append({"name": name, "version": version, "ecosystem": "Maven"})
        except Exception:
            pass
        return deps

    def _parse_gradle(self, fpath: Path) -> List[Dict]:
        """解析 build.gradle / build.gradle.kts"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r"(?:implementation|api|compile)\s*[\(\[]\s*['\"]([^'\"]+)['\"]", content):
                coord = m.group(1)
                parts = coord.split(":")
                if len(parts) >= 2:
                    name = ":".join(parts[:2])
                    ver = parts[2] if len(parts) > 2 else ""
                    deps.append({"name": name, "version": ver, "ecosystem": "Maven"})
        except Exception:
            pass
        return deps

    def _parse_cargo_toml(self, fpath: Path) -> List[Dict]:
        """解析 Cargo.toml"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            in_deps = False
            for line in content.split("\n"):
                if line.strip() in ("[dependencies]", "[dev-dependencies]"):
                    in_deps = True
                    continue
                if line.startswith("[") and in_deps:
                    in_deps = False
                    continue
                if in_deps and "=" in line and not line.startswith("#"):
                    m = re.match(r"([a-zA-Z0-9_-]+)\s*=\s*[\"']?([^\"'\s]*)", line)
                    if m:
                        deps.append({"name": m.group(1), "version": m.group(2) or "", "ecosystem": "crates.io"})
        except Exception:
            pass
        return deps

    def _parse_cargo_lock(self, fpath: Path) -> List[Dict]:
        """解析 Cargo.lock"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r'name\s*=\s*"([^"]+)"\s*\n\s*version\s*=\s*"([^"]+)"', content):
                deps.append({"name": m.group(1), "version": m.group(2), "ecosystem": "crates.io"})
        except Exception:
            pass
        return deps

    def _parse_go_mod(self, fpath: Path) -> List[Dict]:
        """解析 go.mod"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            in_req = False
            for line in content.split("\n"):
                if line.strip().startswith("require "):
                    parts = line.split()
                    if len(parts) >= 3:
                        deps.append({"name": parts[1], "version": parts[2], "ecosystem": "Go"})
                elif line.strip() == "require (":
                    in_req = True
                elif in_req:
                    if line.strip() == ")":
                        in_req = False
                    else:
                        parts = line.split()
                        if len(parts) >= 2:
                            deps.append({"name": parts[0], "version": parts[1], "ecosystem": "Go"})
        except Exception:
            pass
        return deps

    def _parse_go_sum(self, fpath: Path) -> List[Dict]:
        """解析 go.sum"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            seen = set()
            for line in content.split("\n"):
                parts = line.split()
                if len(parts) >= 2:
                    name = parts[0].replace("/go.mod", "")
                    if name not in seen and "/" in name:
                        seen.add(name)
                        ver = parts[1] if len(parts) > 1 else ""
                        deps.append({"name": name, "version": ver, "ecosystem": "Go"})
        except Exception:
            pass
        return deps

    def _parse_gemfile(self, fpath: Path) -> List[Dict]:
        """解析 Gemfile"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r"gem\s+['\"]([^'\"]+)['\"](?:\s*,\s*['\"]([^'\"]+)['\"])?", content):
                deps.append({"name": m.group(1), "version": m.group(2) or "", "ecosystem": "RubyGems"})
        except Exception:
            pass
        return deps

    def _parse_gemfile_lock(self, fpath: Path) -> List[Dict]:
        """解析 Gemfile.lock"""
        deps = []
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            in_specs = False
            for line in content.split("\n"):
                if line.strip() == "specs:":
                    in_specs = True
                    continue
                if in_specs and line.startswith(" "):
                    m = re.match(r"\s+([^\s]+)\s+\(([^)]+)\)", line)
                    if m:
                        deps.append({"name": m.group(1), "version": m.group(2), "ecosystem": "RubyGems"})
                elif in_specs and not line.startswith(" "):
                    break
        except Exception:
            pass
        return deps

    def _parse_composer_json(self, fpath: Path) -> List[Dict]:
        """解析 composer.json"""
        deps = []
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
            for section in ("require", "require-dev"):
                for name, version in data.get(section, {}).items():
                    if name != "php":
                        ver = re.sub(r"^[\^~*>=<]+", "", str(version))
                        deps.append({"name": name, "version": ver, "ecosystem": "Packagist"})
        except Exception:
            pass
        return deps

    def _parse_composer_lock(self, fpath: Path) -> List[Dict]:
        """解析 composer.lock"""
        deps = []
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
            for pkg in data.get("packages", []) + data.get("packages-dev", []):
                name = pkg.get("name", "")
                if name:
                    deps.append({"name": name, "version": pkg.get("version", ""), "ecosystem": "Packagist"})
        except Exception:
            pass
        return deps

    def _query_osv(self, package: str, version: str, ecosystem: str) -> List[Dict]:
        """查询 OSV 漏洞数据库"""
        payload = {
            "package": {
                "name": package,
                "ecosystem": ecosystem,
            }
        }
        if version:
            payload["version"] = version

        data = json.dumps(payload).encode("utf-8")
        req = Request(
            self.OSV_API_URL,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode())
        except Exception:
            return []

        vulns = []
        for vuln in result.get("vulns", [])[:10]:
            severity = "未知"
            cvss = None
            for s in vuln.get("severity", []):
                if s.get("type") == "CVSS_V3":
                    # 预留：后续可解析向量字符串
                    _score_match = re.search(r"CVSS:3\.\d/AV:\w/.*", s.get("score", ""))
                    cvss = s.get("score")
            for db_ref in vuln.get("database_specific", {}).get("severity", []):
                severity = db_ref

            vulns.append({
                "id": vuln.get("id"),
                "summary": vuln.get("summary", "")[:200],
                "severity": severity,
                "cvss": cvss,
                "aliases": vuln.get("aliases", [])[:5],
                "published": vuln.get("published"),
                "modified": vuln.get("modified"),
            })

        return vulns

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "path": {"type": "string", "description": "项目目录或依赖文件路径", "required": True},
                "type": {"type": "string", "description": "依赖类型: python/node/java（可选，自动检测）", "required": False},
            },
        }
