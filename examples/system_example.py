"""
系统操作使用示例
"""
from system.controller import OSController
from system.detector import OSDetector


def example_system_detection():
    """系统检测示例"""
    print("=== 系统检测示例 ===")
    
    detector = OSDetector()
    info = detector.detect()
    
    print(f"操作系统类型: {info.os_type}")
    print(f"操作系统名称: {info.os_name}")
    print(f"操作系统版本: {info.os_version}")
    print(f"架构: {info.architecture}")
    print(f"主机名: {info.hostname}")
    print(f"用户名: {info.username}")


def example_file_operations():
    """文件操作示例"""
    print("\n=== 文件操作示例 ===")
    
    controller = OSController()
    
    # 列出文件
    result = controller.execute("list_files", path=".")
    if result["success"]:
        files = result["result"]
        print(f"当前目录有 {len(files)} 个文件/目录")
        for file in files[:5]:
            print(f"  - {file['name']} ({file['type']})")
    
    # 获取当前目录
    result = controller.execute("get_current_directory")
    if result["success"]:
        print(f"当前目录: {result['result']}")


def example_system_info():
    """系统信息示例"""
    print("\n=== 系统信息示例 ===")
    
    controller = OSController()
    
    # CPU信息
    result = controller.execute("get_cpu_info")
    if result["success"]:
        cpu = result["result"]
        print(f"CPU核心数: {cpu.get('count')}")
        print(f"CPU使用率: {cpu.get('percent', 0):.1f}%")
    
    # 内存信息
    result = controller.execute("get_memory_info")
    if result["success"]:
        mem = result["result"]
        total_gb = mem.get("total", 0) / (1024**3)
        used_gb = mem.get("used", 0) / (1024**3)
        print(f"总内存: {total_gb:.2f} GB")
        print(f"已使用: {used_gb:.2f} GB ({mem.get('percent', 0):.1f}%)")


def example_process_operations():
    """进程操作示例"""
    print("\n=== 进程操作示例 ===")
    
    controller = OSController()
    
    # 列出进程
    result = controller.execute("list_processes", filter_name="python")
    if result["success"]:
        processes = result["result"]
        print(f"找到 {len(processes)} 个Python进程")
        for proc in processes[:3]:
            print(f"  - PID {proc.get('pid')}: {proc.get('name')}")


def example_command_execution():
    """命令执行示例"""
    print("\n=== 命令执行示例 ===")
    
    controller = OSController()
    
    # 检测操作系统
    detector = OSDetector()
    if detector.is_windows():
        command = "dir"
    else:
        command = "ls -la"
    
    result = controller.execute("execute_command", command=command)
    if result["success"]:
        cmd_result = result["result"]
        if cmd_result["success"]:
            print("命令执行成功")
            if cmd_result["stdout"]:
                print(f"输出: {cmd_result['stdout'][:200]}...")


def main():
    """运行所有示例"""
    example_system_detection()
    example_file_operations()
    example_system_info()
    example_process_operations()
    example_command_execution()


if __name__ == "__main__":
    main()

