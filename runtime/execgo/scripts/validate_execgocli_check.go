//go:build ignore
// +build ignore

// 供 validate-execgo-cli.sh 用：go run 校验 ok / helper for shell script
package main

import (
	"encoding/json"
	"io"
	"os"
)

type env struct {
	OK bool `json:"ok"`
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	var e env
	if err := json.Unmarshal(b, &e); err != nil || !e.OK {
		os.Exit(1)
	}
}
