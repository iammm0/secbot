"""
命令执行工具：供智能体执行终端命令
在 macOS 上自动将 Linux 风格的 netstat 等命令改写为兼容形式。
"""
import re
import subprocess
import sys
from typing import Optional
from tools.base import BaseTool, ToolResult
from utils.logger import logger


def _adapt_command_for_platform(command: str) -> str:
    """
    在 macOS 上将常见 Linux 风格命令改写为兼容形式，避免 illegal option 报错。
    """
    if sys.platform != "darwin":
        return command
    cmd = command.strip()
    # netstat 在 macOS 上不支持 -t -u -l -p -o 等 Linux 选项
    if cmd.startswith("netstat ") or cmd == "netstat":
        # 含 Linux 独有选项时改写：-tulpn / -tlnp / -an 等
        if re.search(r"netstat\s+.*-[a-z]*[tulpo][a-z]*", cmd) or " -o " in cmd or " -p " in cmd:
            # 仅查看监听/连接时用 -an（macOS 支持）；需要看 PID 时用 lsof
            if "-l" in cmd or "-n" in cmd or "-a" in cmd or "-t" in cmd:
                logger.info("将 Linux 风格 netstat 改写为 macOS 兼容: netstat -an")
                return "netstat -an"
            return "netstat -an"
    return command


class CommandTool(BaseTool):
    """命令执行工具：执行系统终端命令"""
    
    def __init__(self):
        super().__init__(
            name="execute_command",
            description="执行系统终端命令。可执行文件操作、进程管理、网络等。在 macOS 上 netstat 不支持 -t/-u/-l/-p/-o 等 Linux 选项，会自动改为 netstat -an。"
        )
    
    async def execute(
        self,
        command: str,
        shell: bool = True,
        timeout: int = 30,
        cwd: Optional[str] = None,
        stdin_data: Optional[str] = None,
    ) -> ToolResult:
        """
        执行系统命令

        Args:
            command: 要执行的命令
            shell: 是否使用shell执行（默认True）
            timeout: 超时时间（秒，默认30）
            cwd: 工作目录（可选）
            stdin_data: 可选，传入标准输入（如 sudo 密码），不写入命令行以保证安全
        """
        try:
            command = _adapt_command_for_platform(command)
            # 日志中不打印可能包含密码的 stdin_data
            logger.info(f"执行命令: {command}")

            run_kw = dict(
                capture_output=True,
                text=True,
                timeout=timeout,
                encoding="utf-8",
                errors="ignore",
                cwd=cwd,
            )
            if stdin_data is not None:
                run_kw["input"] = stdin_data

            if sys.platform == "win32":
                if shell:
                    cmd_command = f'cmd /c "{command}"'
                    result = subprocess.run(cmd_command, shell=False, **run_kw)
                else:
                    result = subprocess.run(command.split(), **run_kw)
            else:
                result = subprocess.run(
                    command,
                    shell=shell,
                    executable="/bin/bash" if sys.platform != "darwin" else "/bin/zsh",
                    **run_kw,
                )
            
            success = result.returncode == 0
            
            return ToolResult(
                success=success,
                result={
                    "command": command,
                    "returncode": result.returncode,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "output": result.stdout if success else result.stderr
                },
                error=result.stderr if not success else ""
            )
            
        except subprocess.TimeoutExpired:
            logger.warning(f"命令执行超时: {command}")
            return ToolResult(
                success=False,
                result=None,
                error=f"命令执行超时（{timeout}秒）"
            )
        except Exception as e:
            logger.error(f"执行命令错误: {e}")
            return ToolResult(
                success=False,
                result=None,
                error=str(e)
            )
    
    def get_schema(self) -> dict:
        """获取工具模式"""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "command": {
                    "type": "string",
                    "description": "要执行的系统命令"
                },
                "shell": {
                    "type": "boolean",
                    "description": "是否使用shell执行（默认True）",
                    "default": True
                },
                "timeout": {
                    "type": "integer",
                    "description": "超时时间（秒，默认30）",
                    "default": 30
                },
                "cwd": {
                    "type": "string",
                    "description": "工作目录（可选）"
                }
            }
        }

