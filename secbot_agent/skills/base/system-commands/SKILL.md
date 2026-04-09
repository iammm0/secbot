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
```python
action="list_files"
path="C:\\"           # or "/"
recursive=false       # True for recursive listing
```

### Read File
```python
action="read_file"
file_path="C:\\path\\to\\file.txt"
encoding="utf-8"
```

### Write File
```python
action="write_file"
file_path="C:\\output\\result.txt"
content="file content here"
```

### File Info
```python
action="get_file_info"
file_path="C:\\Windows\\System32\\notepad.exe"
```

### Directory Operations
```python
# Create directory
action="create_directory"
dir_path="C:\\temp\\new_folder"

# Delete file
action="delete_file"
file_path="C:\\temp\\file.txt"

# Delete directory
action="delete_directory"
dir_path="C:\\temp\\folder"

# Copy file
action="copy_file"
src="C:\\source\\file.txt"
dst="C:\\dest\\file.txt"

# Move file
action="move_file"
src="C:\\source\\file.txt"
dst="C:\\dest\\file.txt"
```

## Process Operations

### List Processes
```python
action="list_processes"
# Optional: filter by name
filter_name="python"
```

**Returns:**
- PID, name, CPU%, memory%, status

### Get Process Info
```python
action="get_process_info"
pid=1234
```

### Kill Process
```python
action="kill_process"
pid=1234
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
```python
action="get_cpu_info"
```

### Get Memory Info
```python
action="get_memory_info"
```

### Get Disk Info
```python
action="get_disk_info"
```

### Get Network Info
```python
action="get_network_info"
```

## Security Assessment Use Cases

### 1. System Reconnaissance
```python
# Gather basic system info
action="get_system_info"

# Check disk for suspicious files
action="list_files"
path="C:\\Users"
recursive=true  # May be slow

# Check running processes
action="list_processes"
```

### 2. Malware Analysis
```python
# Check suspicious process
action="get_process_info"
pid=1234

# List processes
action="list_processes"
filter_name="svchost"  # Check for fake svchost

# Check disk for malware
action="list_files"
path="C:\\Windows\\System32"
recursive=false
```

### 3. Privilege Escalation Check
```python
# Current user context
action="execute_command"
command="whoami /all"  # Windows

action="execute_command"  
command="id"  # Linux

# Check for admin rights
action="execute_command"
command="net user admin"  # Windows
```

### 4. Persistence Detection
```python
# Windows startup locations
action="list_files"
path="C:\\Users\\%USERNAME%\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"

# Registry autorun (requires elevated privileges)
action="execute_command"
command="reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"

# Linux crontabs
action="execute_command"
command="cat /etc/crontab"
```

### 5. Credential Hunting
```python
# Windows SAM database (requires SYSTEM)
action="execute_command"
command="reg save HKLM\\SAM C:\\temp\\sam"

# Linux password files
action="execute_command"
command="cat /etc/passwd"
action="execute_command"
command="cat /etc/shadow"  # Requires root

# Browser credentials (Windows)
action="list_files"
path="C:\\Users\\%USERNAME%\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data"
```

## Environment Variables

### Get Environment Variable
```python
action="get_env"
key="PATH"
```

### Set Environment Variable
```python
action="set_env"
key="MY_VAR"
value="test_value"
```

### List All Variables
```python
action="list_env"
```

## Path Operations

### Get Current Directory
```python
action="get_current_directory"
```

### Change Directory
```python
action="change_directory"
path="C:\\temp"
```

### Check Path Exists
```python
action="path_exists"
path="C:\\Windows"
```

## Output Format

All operations return:
```python
{
    "success": True/False,
    "result": <operation result>,
    "error": "error message if failed"
}
```

## Best Practices

1. **Permissions**
   - Some operations require elevated privileges
   - Check return values for permission errors

2. **Performance**
   - Use `recursive=false` for large directories
   - Consider timeout for network operations

3. **Security**
   - Be careful with file write operations
   - Avoid overwriting critical system files

4. **Logging**
   - All operations are logged for audit
   - Sensitive operations may require confirmation
