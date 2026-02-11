---
name: nmap-usage
description: |
  Professional nmap scanning techniques and optimization for penetration testing.
  Use this skill when you need to perform network reconnaissance, port scanning,
  or service enumeration during authorized security assessments.
version: "1.0.0"
author: "Hackbot Security Team"
tags: ["reconnaissance", "network", "scanning", "nmap"]
triggers: ["scan", "port", "network", "nmap", "recon"]
prerequisites: ["authorized_target", "network_access"]
---

# Nmap Professional Scanning Techniques

## Overview

This skill provides advanced nmap scanning techniques optimized for penetration testing engagements.

## Timing Optimization

### Aggressive Timing (`-T4`)
Use for fast, reliable scanning on known networks:
```bash
nmap -T4 -sS <target>
```

### Stealth Timing (`-T2`)
Use when avoiding detection is critical:
```bash
nmap -T2 -sS -f --data-length 50 <target>
```

### Parallel Scanning
```bash
nmap --min-parallelism 100 -p- <target>
```

## Port Selection Strategies

### Quick Discovery
```bash
nmap --top-ports 100 <target>
```

### Full Port Scan
```bash
nmap -p- <target>
```

### Specific Port Ranges
```bash
nmap -p 80,443,8080,8443 <target>
```

## Service Detection

### Version Detection
```bash
nmap -sV --version-intensity 9 <target>
```

### Lightweight Detection
```bash
nmap -sV --version-light <target>
```

## OS Detection

### Aggressive OS Detection
```bash
nmap -O <target>
```

### With Version + Script
```bash
nmap -A <target>
```

## Output Formats

### XML (for parsing)
```bash
nmap -oX report.xml <target>
```

### Grepable
```bash
nmap -oG report.gnmap <target>
```

### All Formats
```bash
nmap -oA report <target>
```

## Useful NSE Scripts

### Vulnerability Scanning
```bash
nmap --script vuln <target>
```