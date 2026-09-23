---
name: system-commands
description: |
  System-level commands for security assessment and system enumeration.
  Use this skill when performing local system reconnaissance, process analysis,
  or system information gathering during authorized security testing.
version: "1.0.0"
author: "Secbot Security Team"
tags: ["system", "process", "file", "network", "information"]
triggers: ["system_info", "process", "file", "disk", "network", "memory"]
prerequisites: ["authorized_target"]
---

# System Commands Reference

## Overview

This skill provides comprehensive system-level commands for security assessment and enumeration.

## File Operations

### List Files
```json
{
    "action": "list_files",
    "path": "C:\\",
    "recursive": false
}
```

### Read File
```json
{
    "action": "read_file",
    "file_path": "C:\\path\\to\\file.txt",
    "encoding": "utf-8"
}
```

### Write File
```json
{
    "action": "write_file",
    "file_path": "C:\\output\\result.txt",
    "content": "file content here"
}
```

### File Info
```json
{
    "action": "get_file_info",
    "file_path": "C:\\Windows\\System32\\notepad.exe"
}
```

### Directory Operations
```json
[
    { "action": "create_directory", "dir_path": "C:\\temp\\new_folder" },
    { "action": "delete_file", "file_path": "C:\\temp\\file.txt" },
    { "action": "delete_directory", "dir_path": "C:\\temp\\folder" },
    { "action": "copy_file", "src": "C:\\source\\file.txt", "dst": "C:\\dest\\file.txt" },
    { "action": "move_file", "src": "C:\\source\\file.txt", "dst": "C:\\dest\\file.txt" }
]
```

## Process Operations

### List Processes
```json
{
    "action": "list_processes",
    "filter_name": "svchost"
}
```

**Returns:**
- PID, name, CPU%, memory%, status

### Get Process Info
```json
{
    "action": "get_process_info",
    "pid": 1234
}
```

### Kill Process
```json
{
    "action": "kill_process",
    "pid": 1234
}
```

### Common Process Enumeration (Security)

| Task | Command | Use Case |
|------|---------|----------|
| Find suspicious processes | `tasklist /v` (Win) / `ps aux` (Lin) | Malware detection |
| Process with network | `netstat -ano` + tasklist | Find process using port |
| Hidden processes | `wmic process` (Win) | Rootkit detection |
| Service processes | `sc query` (Win) / `systemctl list` (Lin) | Persistence check |

## System Information

### Get CPU Info
```json
{
    "action": "get_cpu_info"
}
```

### Get Memory Info
```json
{
    "action": "get_memory_info"
}
```

### Get Disk Info
```json
{
    "action": "get_disk_info"
}
```

### Get Network Info
```json
{
    "action": "get_network_info"
}
```

## Security Assessment Use Cases

### 1. System Reconnaissance
```json
[
    { "action": "get_system_info" },
    { "action": "list_files", "path": "C:\\Users", "recursive": true },
    { "action": "list_processes" }
]
```

### 2. Malware Analysis
```json
[
    { "action": "get_process_info", "pid": 1234 },
    { "action": "list_processes", "filter_name": "svchost" },
    { "action": "list_files", "path": "C:\\Windows\\System32", "recursive": false }
]
```

### 3. Privilege Escalation Check
```json
[
    { "action": "execute_command", "command": "whoami /all" },
    { "action": "execute_command", "command": "id" },
    { "action": "execute_command", "command": "net user admin" }
]
```

### 4. Persistence Detection
```json
[
    {
        "action": "list_files",
        "path": "C:\\Users\\%USERNAME%\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
    },
    {
        "action": "execute_command",
        "command": "reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
    },
    {
        "action": "execute_command",
        "command": "cat /etc/crontab"
    }
]
```

### 5. Credential Hunting
```json
[
    { "action": "execute_command", "command": "reg save HKLM\\SAM C:\\temp\\sam" },
    { "action": "execute_command", "command": "cat /etc/passwd" },
    { "action": "execute_command", "command": "cat /etc/shadow" },
    {
        "action": "list_files",
        "path": "C:\\Users\\%USERNAME%\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data"
    }
]
```

## Environment Variables

### Get Environment Variable
```json
{
    "action": "get_env",
    "key": "PATH"
}
```

### Set Environment Variable
```json
{
    "action": "set_env",
    "key": "MY_VAR",
    "value": "test_value"
}
```

### List All Variables
```json
{
    "action": "list_env"
}
```

## Path Operations

### Get Current Directory
```json
{
    "action": "get_current_directory"
}
```

### Change Directory
```json
{
    "action": "change_directory",
    "path": "C:\\temp"
}
```

### Check Path Exists
```json
{
    "action": "path_exists",
    "path": "C:\\Windows"
}
```

## Output Format

All operations return:
```json
{
    "success": true,
    "result": "<operation result>",
    "error": "error message if failed"
}
```

## Best Practices

1. **Permissions**
   - Some operations require elevated privileges
   - Check return values for permission errors

2. **Performance**
   - Use `recursive: false` for large directories
   - Consider timeout for network operations

3. **Security**
   - Be careful with file write operations
   - Avoid overwriting critical system files

4. **Logging**
   - All operations are logged for audit
   - Sensitive operations may require confirmation
