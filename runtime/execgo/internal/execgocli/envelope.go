package execgocli

import (
	"encoding/json"
	"io"
	"os"
)

// Envelope 是 execgocli 的稳定 JSON 外壳（与 docs/reference/execgo-cli-contract 一致）/ stable JSON envelope.
type Envelope struct {
	OK    bool        `json:"ok"`
	Data  any         `json:"data,omitempty"`
	Error *ErrorValue `json:"error,omitempty"`
}

// ErrorValue 描述失败时的机器可读信息 / machine-readable error.
type ErrorValue struct {
	Message    string `json:"message"`
	StatusCode int    `json:"status_code,omitempty"`
	Body       string `json:"body,omitempty"`
	Hint       string `json:"hint,omitempty"`
}

// WriteStdout 将 envelope 以 JSON 写入 stdout / writes JSON to stdout.
func WriteStdout(env Envelope) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(env)
}

// WriteError 以非零业务 ok 的 envelope 写 stdout / writes failed envelope.
func WriteError(err ErrorValue) error {
	return WriteStdout(Envelope{OK: false, Error: &err})
}

// WriteOK 写入成功包 / success envelope.
func WriteOK(data any) error {
	return WriteStdout(Envelope{OK: true, Data: data})
}

// ReadAllLimit 从 reader 读取至多 max 字节 / reads up to max bytes (safety for HTTP bodies).
func ReadAllLimit(r io.Reader, max int64) ([]byte, error) {
	if max <= 0 {
		max = 1 << 20
	}
	return io.ReadAll(io.LimitReader(r, max))
}
