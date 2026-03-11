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
```python
{
    "action": "list_files",
    "path": "C:\\temp",
    "recursive": false
}
```

#### read_file
Read file contents.
```python
{
    "action": "read_file",
    "file_path": "C:\\notes\\info.txt"
}
```

#### write_file
Write content to file.
```python
{
    "action": "write_file",
    "file_path": "C:\\output\\findings.txt",
    "content": "Security findings..."
}
```

#### create_directory
Create new directory.
```python
{
    "action": "create_directory",
    "dir_path": "C:\\temp\\scan_results"
}
```

#### delete_file / delete_directory
Delete files or directories.
```python
{
    "action": "delete_file",
    "file_path": "C:\\temp\\temp.txt"
}
```

#### copy_file / move_file
Copy or move files.
```python
{
    "action": "copy_file",
    "src": "C:\\source\\file.txt",
    "dst": "C:\\dest\\file.txt"
}
```

#### get_file_info
Get file metadata.
```python
{
    "action": "get_file_info",
    "file_path": "C:\\Windows\\notepad.exe"
}
```

### Process Operations

#### list_processes
List all running processes.
```python
{
    "action": "list_processes"
}
# Optional: filter by name
{
    "action": "list_processes",
    "filter_name": "python"
}
```

#### get_process_info
Get detailed process information.
```python
{
    "action": "get_process_info",
    "pid": 1234
}
```

#### kill_process
Terminate a process.
```python
{
    "action": "kill_process",
    "pid": 1234
}
```

### System Information

#### get_cpu_info
Get CPU details.
```python
{
    "action": "get_cpu_info"
}
```

#### get_memory_info
Get memory usage.
```python
{
    "action": "get_memory_info"
}
```

#### get_disk_info
Get disk partition information.
```python
{
    "action": "get_disk_info"
}
```

#### get_network_info
Get network interface details.
```python
{
    "action": "get_network_info"
}
```

### Command Execution

#### execute_command
Execute system commands.
```python
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
```python
{
    "action": "get_env",
    "key": "PATH"
}
```

#### set_env
Set environment variable.
```python
{
    "action": "set_env",
    "key": "TEST_VAR",
    "value": "test_value"
}
```

#### list_env
List all environment variables.
```python
{
    "action": "list_env"
}
```

### Path Operations

#### get_current_directory
Get current working directory.
```python
{
    "action": "get_current_directory"
}
```

#### change_directory
Change working directory.
```python
{
    "action": "change_directory",
    "path": "C:\\temp"
}
```

#### path_exists
Check if path exists.
```python
{
    "action": "path_exists",
    "path": "C:\\Windows"
}
```

## Security Testing Workflows

### Initial Reconnaissance
```python
# 1. System overview
action="get_system_info"
action="get_cpu_info"
action="get_memory_info"

# 2. Network configuration
action="get_network_info"

# 3. Disk overview
action="get_disk_info"

# 4. Current location
action="get_current_directory"
```

### Process Analysis
```python
# List all processes
action="list_processes"

# Find suspicious processes
action="list_processes"
filter_name="svchost"  # Check for anomalies

# Investigate specific process
action="get_process_info"
pid=<suspicious_pid>

# Terminate if needed (malware)
action="kill_process"
pid=<malware_pid>
```

### File System Exploration
```python
# List user directories
action="list_files"
path="C:\\Users"
recursive=false

# Find interesting files
action="list_files"
path="C:\\"
recursive=false  # Use carefully

# Read configuration
action="read_file"
file_path="C:\\Windows\\System32\\drivers\\etc\\hosts"

# Document findings
action="write_file"
file_path="C:\\temp\\findings.txt"
content="Scan results..."
```

### Network Investigation
```python
# Get network interfaces
action="get_network_info"

# Execute network commands
action="execute_command"
command="netstat -ano"

action="execute_command"
command="arp -a"

action="execute_command"
command="ipconfig /all"
```

### Privilege Escalation
```python
# Check current user
action="execute_command"
command="whoami /all"  # Windows

action="execute_command"
command="id"  # Linux

# Check for admin access
action="execute_command"
command="net localgroup Administrators"

# Service permissions
action="execute_command"
command="sc query"  # Windows
```

## Action Combinations for Complex Tasks

### 1. Comprehensive System Audit
```python
# Step 1: Basic info
action="get_system_info"

# Step 2: Processes
action="list_processes"

# Step 3: Network
action="get_network_info"

# Step 4: Disk
action="get_disk_info"

# Step 5: Environment
action="list_env"
```

### 2. Malware Investigation
```python
# Step 1: Find suspicious processes
action="list_processes"
filter_name="exe_name"

# Step 2: Get process details
action="get_process_info"
pid=1234

# Step 3: Check file location
action="get_file_info"
file_path="C:\\path\\to\\malware.exe"

# Step 4: Document
action="write_file"
file_path="C:\\temp\\malware_analysis.txt"
content="Analysis results..."

# Step 5: Isolate/quarantine
action="kill_process"
pid=1234
```

### 3. Post-Exploitation Documentation
```python
# Step 1: System info
action="get_system_info"
action="get_cpu_info"
action="get_memory_info"

# Step 2: Network
action="get_network_info"

# Step 3: User context
action="execute_command"
command="whoami /all"

# Step 4: Save report
action="write_file"
file_path="C:\\temp\\assessment_report.txt"
content="Report content..."
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
   ```python
   if result["success"]:
       process(result["result"])
   else:
       handle_error(result.get("error"))
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
```python
{
    "action": "list_files",
    "kwargs": {
        "path": "C:\\temp",
        "recursive": false
    }
}
```

This format is automatically handled by the tool.
