---
name: system-control
description: |
  Comprehensive system control operations for security testing.
  Use this skill when you need unified access to file operations, process management,
  system information, and command execution through a single interface
  during authorized penetration testing.
version: "1.0.0"
author: "Secbot Security Team"
tags: ["system", "control", "unified", "operations", "security"]
triggers: ["system_control", "file_ops", "process_control", "sysinfo", "operations"]
prerequisites: ["authorized_target"]
---

# System Control Skill Guide

## Overview

This skill provides a unified interface for system operations during security assessments, combining file management, process control, system information, and command execution.

## Available Actions

### File Operations

#### list_files
List files in a directory.
```json
{
    "action": "list_files",
    "path": "C:\\temp",
    "recursive": false
}
```

#### read_file
Read file contents.
```json
{
    "action": "read_file",
    "file_path": "C:\\notes\\info.txt"
}
```

#### write_file
Write content to file.
```json
{
    "action": "write_file",
    "file_path": "C:\\output\\findings.txt",
    "content": "Security findings..."
}
```

#### create_directory
Create new directory.
```json
{
    "action": "create_directory",
    "dir_path": "C:\\temp\\scan_results"
}
```

#### delete_file / delete_directory
Delete files or directories.
```json
{
    "action": "delete_file",
    "file_path": "C:\\temp\\temp.txt"
}
```

#### copy_file / move_file
Copy or move files.
```json
{
    "action": "copy_file",
    "src": "C:\\source\\file.txt",
    "dst": "C:\\dest\\file.txt"
}
```

#### get_file_info
Get file metadata.
```json
{
    "action": "get_file_info",
    "file_path": "C:\\Windows\\notepad.exe"
}
```

### Process Operations

#### list_processes
List all running processes.
```json
{
    "action": "list_processes"
}
```
Optional: filter by name
```json
{
    "action": "list_processes",
    "filter_name": "svchost"
}
```

#### get_process_info
Get detailed process information.
```json
{
    "action": "get_process_info",
    "pid": 1234
}
```

#### kill_process
Terminate a process.
```json
{
    "action": "kill_process",
    "pid": 1234
}
```

### System Information

#### get_cpu_info
Get CPU details.
```json
{
    "action": "get_cpu_info"
}
```

#### get_memory_info
Get memory usage.
```json
{
    "action": "get_memory_info"
}
```

#### get_disk_info
Get disk partition information.
```json
{
    "action": "get_disk_info"
}
```

#### get_network_info
Get network interface details.
```json
{
    "action": "get_network_info"
}
```

### Command Execution

#### execute_command
Execute system commands.
```json
{
    "action": "execute_command",
    "command": "ipconfig /all",
    "shell": true,
    "timeout": 30
}
```

### Environment Variables

#### get_env
Get specific environment variable.
```json
{
    "action": "get_env",
    "key": "PATH"
}
```

#### set_env
Set environment variable.
```json
{
    "action": "set_env",
    "key": "TEST_VAR",
    "value": "test_value"
}
```

#### list_env
List all environment variables.
```json
{
    "action": "list_env"
}
```

### Path Operations

#### get_current_directory
Get current working directory.
```json
{
    "action": "get_current_directory"
}
```

#### change_directory
Change working directory.
```json
{
    "action": "change_directory",
    "path": "C:\\temp"
}
```

#### path_exists
Check if path exists.
```json
{
    "action": "path_exists",
    "path": "C:\\Windows"
}
```

## Security Testing Workflows

### Initial Reconnaissance
```json
[
    { "action": "get_system_info" },
    { "action": "get_cpu_info" },
    { "action": "get_memory_info" },
    { "action": "get_network_info" },
    { "action": "get_disk_info" },
    { "action": "get_current_directory" }
]
```

### Process Analysis
```json
[
    { "action": "list_processes" },
    { "action": "list_processes", "filter_name": "svchost" },
    { "action": "get_process_info", "pid": "<suspicious_pid>" },
    { "action": "kill_process", "pid": "<malware_pid>" }
]
```

### File System Exploration
```json
[
    { "action": "list_files", "path": "C:\\Users", "recursive": false },
    { "action": "list_files", "path": "C:\\", "recursive": false },
    { "action": "read_file", "file_path": "C:\\Windows\\System32\\drivers\\etc\\hosts" },
    { "action": "write_file", "file_path": "C:\\temp\\findings.txt", "content": "Scan results..." }
]
```

### Network Investigation
```json
[
    { "action": "get_network_info" },
    { "action": "execute_command", "command": "netstat -ano" },
    { "action": "execute_command", "command": "arp -a" },
    { "action": "execute_command", "command": "ipconfig /all" }
]
```

### Privilege Escalation
```json
[
    { "action": "execute_command", "command": "whoami /all" },
    { "action": "execute_command", "command": "id" },
    { "action": "execute_command", "command": "net localgroup Administrators" },
    { "action": "execute_command", "command": "sc query" }
]
```

## Action Combinations for Complex Tasks

### 1. Comprehensive System Audit
```json
[
    { "action": "get_system_info" },
    { "action": "list_processes" },
    { "action": "get_network_info" },
    { "action": "get_disk_info" },
    { "action": "list_env" }
]
```

### 2. Malware Investigation
```json
[
    { "action": "list_processes", "filter_name": "exe_name" },
    { "action": "get_process_info", "pid": 1234 },
    { "action": "get_file_info", "file_path": "C:\\path\\to\\malware.exe" },
    { "action": "write_file", "file_path": "C:\\temp\\malware_analysis.txt", "content": "Analysis results..." },
    { "action": "kill_process", "pid": 1234 }
]
```

### 3. Post-Exploitation Documentation
```json
[
    { "action": "get_system_info" },
    { "action": "get_cpu_info" },
    { "action": "get_memory_info" },
    { "action": "get_network_info" },
    { "action": "execute_command", "command": "whoami /all" },
    { "action": "write_file", "file_path": "C:\\temp\\assessment_report.txt", "content": "Report content..." }
]
```

## Best Practices

1. **Always Check Success**
   - Verify `success: true` in response
   - Handle errors appropriately

2. **Use Appropriate Timeouts**
   - Quick operations: 10-30s
   - File scans: 60-120s
   - Network operations: 30-60s

3. **Security Considerations**
   - Don't write sensitive data to world-readable paths
   - Clear temp files after use
   - Log all operations for audit trail

4. **Error Handling**
   ```json
   {
       "success": true,
       "result": "<operation result>"
   }
   ```
   Or on failure:
   ```json
   {
       "success": false,
       "error": "error message"
   }
   ```

## Common Error Codes

| Error | Cause | Solution |
|-------|-------|----------|
| "未知操作" | Invalid action name | Check available_actions |
| "Permission denied" | Insufficient privileges | Run with elevated permissions |
| "File not found" | Path doesn't exist | Verify path with path_exists |
| "Access denied" | Protected resource | Check file/directory permissions |
| "Command timeout" | Operation took too long | Increase timeout value |

## Nested Parameters

Some actions accept additional parameters in a `kwargs` object:
```json
{
    "action": "list_files",
    "kwargs": {
        "path": "C:\\temp",
        "recursive": false
    }
}
```

This format is automatically handled by the tool.
