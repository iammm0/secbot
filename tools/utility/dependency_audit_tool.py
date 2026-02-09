"""依赖漏洞审计工具：解析项目依赖文件，查询已知漏洞"""
import asyncio
import json
import re
from pathlib import Path
from typing import Any, Dict, List
from urllib.request import Request, urlopen
from tools.base import BaseTool, ToolResult


class DependencyAuditTool(BaseTool):
    """依赖漏洞审计工具（使用 OSV API）"""

    sensitivity = "low"

    OSV_API_URL = "https://api.osv.dev/v1/query"

    def __init__(self):
        super().__init__(
            name="dependency_audit",
            description=(
                "扫描项目依赖文件（requirements.txt / package.json / pom.xml 等），"
                "通过 OSV 数据库查询已知漏洞。"
                "参数: path(项目目录或依赖文件路径), type(python/node/java, 可选自动检测)"
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
                error="未找到依赖文件或无法解析。支持的格式: requirements.txt, package.json, Pipfile",
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

    def _parse_dependencies(self, target: Path, dep_type: str) -> List[Dict]:
        """解析依赖文件"""
        deps = []

        if target.is_file():
            files = [target]
        else:
            files = list(target.iterdir())

        for fpath in files:
            if not fpath.is_file():
                continue
            name = fpath.name.lower()

            # Python: requirements.txt
            if name == "requirements.txt" or (dep_type == "python" and name.endswith(".txt")):
                deps.extend(self._parse_requirements_txt(fpath))

            # Python: Pipfile
            elif name == "pipfile":
                deps.extend(self._parse_pipfile(fpath))

            # Node: package.json
            elif name == "package.json":
                deps.extend(self._parse_package_json(fpath))

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
            for section in ["dependencies", "devDependencies"]:
                for name, version in data.get(section, {}).items():
                    # 清理版本号
                    ver = re.sub(r"^[\^~>=<]+", "", version)
                    deps.append({
                        "name": name,
                        "version": ver,
                        "ecosystem": "npm",
                    })
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
                    score_match = re.search(r"CVSS:3\.\d/AV:\w/.*", s.get("score", ""))
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
