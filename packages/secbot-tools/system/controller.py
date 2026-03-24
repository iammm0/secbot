"""
操作系统控制器：统一接口
"""
from typing import Dict, List, Optional, Any
from system.detector import OSDetector, SystemInfo
from system.commands import SystemCommands
from utils.logger import logger


class OSController:
    """操作系统控制器：提供统一的系统操作接口"""
    
    def __init__(self):
        self.detector = OSDetector()
        self.system_info = self.detector.detect()
        self.commands = SystemCommands()
        
        logger.info(f"初始化OS控制器: {self.system_info.os_type}")
    
    def get_system_info(self) -> Dict:
        """获取系统信息"""
        return self.system_info.to_dict()
    
    def execute(self, action: str, **kwargs) -> Dict[str, Any]:
        """
        执行系统操作
        
        Args:
            action: 操作类型
            **kwargs: 操作参数
            
        Returns:
            操作结果
        """
        try:
            # 文件操作
            if action == "list_files":
                return {"success": True, "result": self.commands.list_files(**kwargs)}
            elif action == "read_file":
                return {"success": True, "result": self.commands.read_file(**kwargs)}
            elif action == "write_file":
                return {"success": self.commands.write_file(**kwargs), "result": None}
            elif action == "create_directory":
                return {"success": self.commands.create_directory(**kwargs), "result": None}
            elif action == "delete_file":
                return {"success": self.commands.delete_file(**kwargs), "result": None}
            elif action == "delete_directory":
                return {"success": self.commands.delete_directory(**kwargs), "result": None}
            elif action == "copy_file":
                return {"success": self.commands.copy_file(**kwargs), "result": None}
            elif action == "move_file":
                return {"success": self.commands.move_file(**kwargs), "result": None}
            elif action == "get_file_info":
                return {"success": True, "result": self.commands.get_file_info(**kwargs)}
            
            # 进程操作
            elif action == "list_processes":
                return {"success": True, "result": self.commands.list_processes(**kwargs)}
            elif action == "kill_process":
                return {"success": self.commands.kill_process(**kwargs), "result": None}
            elif action == "get_process_info":
                return {"success": True, "result": self.commands.get_process_info(**kwargs)}
            
            # 系统信息
            elif action == "get_cpu_info":
                return {"success": True, "result": self.commands.get_cpu_info()}
            elif action == "get_memory_info":
                return {"success": True, "result": self.commands.get_memory_info()}
            elif action == "get_disk_info":
                return {"success": True, "result": self.commands.get_disk_info()}
            elif action == "get_network_info":
                return {"success": True, "result": self.commands.get_network_info()}
            
            # 命令执行
            elif action == "execute_command":
                return {"success": True, "result": self.commands.execute_command(**kwargs)}
            
            # 环境变量
            elif action == "get_env":
                return {"success": True, "result": self.commands.get_env(**kwargs)}
            elif action == "set_env":
                return {"success": self.commands.set_env(**kwargs), "result": None}
            elif action == "list_env":
                return {"success": True, "result": self.commands.list_env()}
            
            # 路径操作
            elif action == "get_current_directory":
                return {"success": True, "result": self.commands.get_current_directory()}
            elif action == "change_directory":
                return {"success": self.commands.change_directory(**kwargs), "result": None}
            elif action == "path_exists":
                return {"success": True, "result": self.commands.path_exists(**kwargs)}
            
            else:
                return {
                    "success": False,
                    "result": None,
                    "error": f"未知操作: {action}"
                }
        
        except Exception as e:
            logger.error(f"执行操作错误 ({action}): {e}")
            return {
                "success": False,
                "result": None,
                "error": str(e)
            }
    
    def get_available_actions(self) -> List[str]:
        """获取所有可用操作"""
        return [
            # 文件操作
            "list_files", "read_file", "write_file", "create_directory",
            "delete_file", "delete_directory", "copy_file", "move_file", "get_file_info",
            # 进程操作
            "list_processes", "kill_process", "get_process_info",
            # 系统信息
            "get_cpu_info", "get_memory_info", "get_disk_info", "get_network_info",
            # 命令执行
            "execute_command",
            # 环境变量
            "get_env", "set_env", "list_env",
            # 路径操作
            "get_current_directory", "change_directory", "path_exists"
        ]

