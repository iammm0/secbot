"""容器环境检测工具：检测当前是否运行在 Docker/K8s 容器中，收集容器信息"""
import os
import platform
from pathlib import Path
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class ContainerInfoTool(BaseTool):
    """容器环境检测工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="container_info",
            description=(
                "检测当前环境是否运行在 Docker / Kubernetes 容器中，"
                "收集容器相关信息（容器 ID、镜像、挂载点、capabilities 等）。"
                "无需参数。"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        result = {
            "system": platform.system(),
            "hostname": platform.node(),
            "in_container": False,
            "container_type": None,
            "details": {},
            "security_findings": [],
        }

        # 检测 Docker
        docker_detected = self._detect_docker()
        if docker_detected:
            result["in_container"] = True
            result["container_type"] = "docker"
            result["details"].update(docker_detected)

        # 检测 Kubernetes
        k8s_detected = self._detect_kubernetes()
        if k8s_detected:
            result["in_container"] = True
            result["container_type"] = "kubernetes"
            result["details"].update(k8s_detected)

        # 收集安全相关信息
        result["details"]["environment_variables"] = self._get_sensitive_env_vars()
        result["details"]["mounts"] = self._get_mounts()
        result["details"]["capabilities"] = self._get_capabilities()

        # 安全发现
        result["security_findings"] = self._analyze_security(result)

        return ToolResult(success=True, result=result)

    def _detect_docker(self) -> Dict:
        """检测 Docker 环境"""
        info = {}

        # 检查 /.dockerenv
        if Path("/.dockerenv").exists():
            info["dockerenv"] = True

        # 检查 cgroup
        try:
            cgroup = Path("/proc/1/cgroup").read_text(errors="ignore")
            if "docker" in cgroup or "containerd" in cgroup:
                info["cgroup_docker"] = True
                # 提取容器 ID
                for line in cgroup.split("\n"):
                    if "docker" in line or "containerd" in line:
                        parts = line.split("/")
                        if len(parts) > 2:
                            container_id = parts[-1].strip()
                            if len(container_id) >= 12:
                                info["container_id"] = container_id[:12]
                        break
        except (FileNotFoundError, PermissionError):
            pass

        # 检查 /proc/1/environ
        try:
            environ = Path("/proc/1/environ").read_text(errors="ignore")
            if "container=docker" in environ:
                info["proc_environ_docker"] = True
        except (FileNotFoundError, PermissionError):
            pass

        return info if info else {}

    def _detect_kubernetes(self) -> Dict:
        """检测 Kubernetes 环境"""
        info = {}

        # 检查 K8s 环境变量
        if os.getenv("KUBERNETES_SERVICE_HOST"):
            info["k8s_service_host"] = os.getenv("KUBERNETES_SERVICE_HOST")
            info["k8s_service_port"] = os.getenv("KUBERNETES_SERVICE_PORT")

        # 检查 K8s service account token
        sa_token = Path("/var/run/secrets/kubernetes.io/serviceaccount/token")
        if sa_token.exists():
            info["service_account_token"] = True
            try:
                info["namespace"] = Path(
                    "/var/run/secrets/kubernetes.io/serviceaccount/namespace"
                ).read_text().strip()
            except Exception:
                pass

        # 检查 K8s 相关环境变量
        k8s_vars = {}
        for key, val in os.environ.items():
            if key.startswith("KUBERNETES_") or key.endswith("_SERVICE_HOST"):
                k8s_vars[key] = val
        if k8s_vars:
            info["k8s_env_vars"] = k8s_vars

        return info if info else {}

    def _get_sensitive_env_vars(self) -> Dict:
        """获取安全相关的环境变量（脱敏）"""
        sensitive_keys = [
            "AWS_ACCESS_KEY", "AWS_SECRET", "API_KEY", "TOKEN",
            "PASSWORD", "SECRET", "DATABASE_URL", "REDIS_URL",
            "MONGO", "MYSQL", "POSTGRES",
        ]
        found = {}
        for key, val in os.environ.items():
            for sk in sensitive_keys:
                if sk.lower() in key.lower():
                    # 脱敏
                    if len(val) > 6:
                        found[key] = val[:3] + "***" + val[-3:]
                    else:
                        found[key] = "***"
                    break
        return found

    def _get_mounts(self) -> list:
        """获取挂载点信息"""
        mounts = []
        try:
            content = Path("/proc/mounts").read_text(errors="ignore")
            for line in content.split("\n"):
                parts = line.split()
                if len(parts) >= 3:
                    device, mount_point, fs_type = parts[0], parts[1], parts[2]
                    # 只关注有趣的挂载点
                    if mount_point.startswith("/") and fs_type not in ("proc", "sysfs", "tmpfs", "devpts", "mqueue"):
                        mounts.append({
                            "device": device,
                            "mount_point": mount_point,
                            "fs_type": fs_type,
                        })
        except (FileNotFoundError, PermissionError):
            pass
        return mounts[:20]

    def _get_capabilities(self) -> Dict:
        """获取进程 capabilities"""
        caps = {}
        try:
            status = Path("/proc/1/status").read_text(errors="ignore")
            for line in status.split("\n"):
                if line.startswith("Cap"):
                    key, _, val = line.partition(":")
                    caps[key.strip()] = val.strip()
        except (FileNotFoundError, PermissionError):
            pass
        return caps

    def _analyze_security(self, result: Dict) -> list:
        """分析安全风险"""
        findings = []
        details = result.get("details", {})

        if not result["in_container"]:
            findings.append({"level": "info", "message": "未检测到容器环境"})
            return findings

        # Docker socket 挂载检查
        if Path("/var/run/docker.sock").exists():
            findings.append({
                "level": "critical",
                "message": "检测到 Docker socket 挂载（/var/run/docker.sock），可导致容器逃逸",
            })

        # 特权模式检查
        caps = details.get("capabilities", {})
        if caps.get("CapEff", "").strip() == "0000003fffffffff":
            findings.append({
                "level": "critical",
                "message": "容器以特权模式运行（全部 capabilities），存在逃逸风险",
            })

        # K8s service account token
        if details.get("service_account_token"):
            findings.append({
                "level": "high",
                "message": "K8s Service Account Token 可访问，可能被用于集群内横向移动",
            })

        # 敏感环境变量
        env_vars = details.get("environment_variables", {})
        if env_vars:
            findings.append({
                "level": "medium",
                "message": f"检测到 {len(env_vars)} 个敏感环境变量（密钥/密码/数据库连接等）",
            })

        # 宿主机文件系统挂载
        mounts = details.get("mounts", [])
        for m in mounts:
            if m.get("mount_point") in ("/", "/host", "/hostfs"):
                findings.append({
                    "level": "high",
                    "message": f"检测到宿主机根文件系统挂载: {m['mount_point']}",
                })

        if not findings:
            findings.append({"level": "info", "message": "容器配置未发现明显安全问题"})

        return findings

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {},
        }
