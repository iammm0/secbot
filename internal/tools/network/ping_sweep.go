package network

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

// PingSweepTool 对 CIDR 网段进行主机存活探测（优先 ICMP ping，失败时可结合 TCP 探测）。
type PingSweepTool struct{}

func (t *PingSweepTool) Name() string { return "ping_sweep" }
func (t *PingSweepTool) Description() string {
	return "对 CIDR 网段进行存活主机探测：先尝试系统 ping（ICMP），再对未响应主机尝试 TCP 连接常见端口。输入: 例如 192.168.1.0/24"
}

func (t *PingSweepTool) Call(ctx context.Context, input string) (string, error) {
	cidr := strings.TrimSpace(input)
	if cidr == "" {
		return "", fmt.Errorf("请提供 CIDR，例如 192.168.1.0/24")
	}

	_, ipnet, err := net.ParseCIDR(cidr)
	if err != nil {
		return "", fmt.Errorf("无效的 CIDR: %w", err)
	}

	ips, err := ipv4HostsInCIDR(ipnet)
	if err != nil {
		return "", err
	}
	if len(ips) == 0 {
		return "", fmt.Errorf("网段内无可用主机地址")
	}
	if len(ips) > 4096 {
		return "", fmt.Errorf("网段过大（>%d 个地址），请缩小范围", 4096)
	}

	type hostResult struct {
		IP     string `json:"ip"`
		Alive  bool   `json:"alive"`
		Method string `json:"method,omitempty"`
	}

	results := make([]hostResult, len(ips))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 48)

	for i, addr := range ips {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, ipStr string) {
			defer wg.Done()
			defer func() { <-sem }()

			if alive, ok := icmpPing(ctx, ipStr); ok && alive {
				results[idx] = hostResult{IP: ipStr, Alive: true, Method: "icmp"}
				return
			}
			if tcpAlive(ctx, ipStr) {
				results[idx] = hostResult{IP: ipStr, Alive: true, Method: "tcp"}
				return
			}
			results[idx] = hostResult{IP: ipStr, Alive: false}
		}(i, addr)
	}
	wg.Wait()

	aliveList := make([]hostResult, 0)
	for _, r := range results {
		if r.Alive {
			aliveList = append(aliveList, r)
		}
	}

	out, _ := json.MarshalIndent(map[string]any{
		"cidr":        cidr,
		"total_hosts": len(ips),
		"alive_count": len(aliveList),
		"alive":       aliveList,
	}, "", "  ")
	return string(out), nil
}

// ipv4HostsInCIDR 枚举 IPv4 CIDR 内主机地址（/32 单主机；/31 双主机；其它掩码排除网络与广播）。
func ipv4HostsInCIDR(ipnet *net.IPNet) ([]string, error) {
	ip4 := ipnet.IP.To4()
	if ip4 == nil {
		return nil, fmt.Errorf("当前仅支持 IPv4 CIDR")
	}
	maskBits, _ := ipnet.Mask.Size()
	mb := []byte(ipnet.Mask)
	if len(mb) != 4 {
		return nil, fmt.Errorf("无效的 IPv4 掩码")
	}
	mask := binary.BigEndian.Uint32(mb)
	network := binary.BigEndian.Uint32(ip4.Mask(ipnet.Mask))
	broadcast := network | ^mask

	if maskBits == 32 {
		return []string{ip4.String()}, nil
	}
	if maskBits == 31 {
		out := make([]string, 0, 2)
		for i := network; i <= broadcast; i++ {
			nip := make(net.IP, 4)
			binary.BigEndian.PutUint32(nip, i)
			out = append(out, nip.String())
		}
		return out, nil
	}

	var out []string
	for i := network + 1; i < broadcast; i++ {
		nip := make(net.IP, 4)
		binary.BigEndian.PutUint32(nip, i)
		out = append(out, nip.String())
	}
	return out, nil
}

func icmpPing(ctx context.Context, ip string) (alive bool, ok bool) {
	var args []string
	if runtime.GOOS == "windows" {
		args = []string{"-n", "1", "-w", "800", ip}
	} else {
		args = []string{"-c", "1", "-W", "1", ip}
	}
	cctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "ping", args...)
	err := cmd.Run()
	if err != nil {
		// ping 不可用或权限问题时仍返回 ok=false，让上层走 TCP
		if _, ok := err.(*exec.ExitError); ok {
			return false, true
		}
		return false, false
	}
	return true, true
}

func tcpAlive(ctx context.Context, ip string) bool {
	ports := []int{80, 443, 22, 445}
	d := net.Dialer{Timeout: 600 * time.Millisecond}
	for _, p := range ports {
		addr := net.JoinHostPort(ip, fmt.Sprintf("%d", p))
		c, err := d.DialContext(ctx, "tcp", addr)
		if err == nil {
			_ = c.Close()
			return true
		}
	}
	return false
}
