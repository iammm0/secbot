// Package config 管理 ExecGo 的配置与可插拔配置源 / ExecGo configuration and pluggable config sources.
// Author: iammm0; Last edited: 2026-04-23
package config

import (
	"flag"
	"os"
	"strconv"
)

// 逻辑键（与 Env 名对应，供 Provider 实现使用）/ logical keys for Provider implementations.
const (
	KeyHTTPAddr        = "http_addr"
	KeyGRPCAddr        = "grpc_addr"
	KeyDataDir         = "data_dir"
	KeyMaxConcurrency  = "max_concurrency"
	KeyShutdownTimeout = "shutdown_timeout"
	EnvHTTPAddr        = "EXECGO_ADDR"
	EnvGRPCAddr        = "EXECGO_GRPC_ADDR"
	EnvDataDir         = "EXECGO_DATA_DIR"
	EnvMaxConcurrency  = "EXECGO_MAX_CONCURRENCY"
	EnvShutdownTimeout = "EXECGO_SHUTDOWN_TIMEOUT"
)

// Config 全局配置 / global configuration.
type Config struct {
	HTTPAddr        string
	GRPCAddr        string
	DataDir         string
	MaxConcurrency  int
	ShutdownTimeout int
}

// Provider 抽象配置源（可对接 Viper、自定义 map 等）/ abstract config source (Viper, custom maps, etc.).
type Provider interface {
	GetString(key string, defaultVal string) string
	GetInt(key string, defaultVal int) int
}

// Load 从 Provider 填充 Config / builds Config from a Provider.
func Load(p Provider) *Config {
	return &Config{
		HTTPAddr:        p.GetString(KeyHTTPAddr, ":8080"),
		GRPCAddr:        p.GetString(KeyGRPCAddr, ":50051"),
		DataDir:         p.GetString(KeyDataDir, "data"),
		MaxConcurrency:  p.GetInt(KeyMaxConcurrency, 10),
		ShutdownTimeout: p.GetInt(KeyShutdownTimeout, 15),
	}
}

// ----------------------------------------------------------------
// Flag + Env Provider（默认 CLI 行为）/ default CLI: flags with env defaults
// ----------------------------------------------------------------

// FlagEnvProvider 使用 flag 与环境变量（flag 优先于注册时的 env 默认值）/ flags with env-derived defaults.
type FlagEnvProvider struct {
	httpAddr        string
	grpcAddr        string
	dataDir         string
	maxConcurrency  int
	shutdownTimeout int
}

// NewFlagEnvProvider 注册 flag、执行 Parse，并返回可作为 Provider 使用的值 / registers flags, parses, returns Provider values.
func NewFlagEnvProvider() *FlagEnvProvider {
	p := &FlagEnvProvider{}
	flag.StringVar(&p.httpAddr, "addr", envOrDefault(EnvHTTPAddr, ":8080"), "HTTP listen address")
	flag.StringVar(&p.grpcAddr, "grpc-addr", envOrDefault(EnvGRPCAddr, ":50051"), "gRPC listen address")
	flag.StringVar(&p.dataDir, "data-dir", envOrDefault(EnvDataDir, "data"), "data directory for persistence")
	flag.IntVar(&p.maxConcurrency, "max-concurrency", envOrDefaultInt(EnvMaxConcurrency, 10), "max concurrent task executions")
	flag.IntVar(&p.shutdownTimeout, "shutdown-timeout", envOrDefaultInt(EnvShutdownTimeout, 15), "graceful shutdown timeout in seconds")
	flag.Parse()
	return p
}

// GetString 实现 Provider / implements Provider.
func (p *FlagEnvProvider) GetString(key string, defaultVal string) string {
	switch key {
	case KeyHTTPAddr:
		return nonEmpty(p.httpAddr, defaultVal)
	case KeyGRPCAddr:
		return nonEmpty(p.grpcAddr, defaultVal)
	case KeyDataDir:
		return nonEmpty(p.dataDir, defaultVal)
	default:
		return defaultVal
	}
}

// GetInt 实现 Provider / implements Provider.
func (p *FlagEnvProvider) GetInt(key string, defaultVal int) int {
	switch key {
	case KeyMaxConcurrency:
		if p.maxConcurrency > 0 {
			return p.maxConcurrency
		}
	case KeyShutdownTimeout:
		if p.shutdownTimeout > 0 {
			return p.shutdownTimeout
		}
	}
	return defaultVal
}

func nonEmpty(s, def string) string {
	if s != "" {
		return s
	}
	return def
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envOrDefaultInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// MapProvider 用于测试或简单嵌入：字符串键为 Key* 常量 / for tests: keys are Key* constants.
type MapProvider struct {
	Strings map[string]string
	Ints    map[string]int
}

// GetString 实现 Provider / implements Provider.
func (m MapProvider) GetString(key string, defaultVal string) string {
	if m.Strings == nil {
		return defaultVal
	}
	if v, ok := m.Strings[key]; ok && v != "" {
		return v
	}
	return defaultVal
}

// GetInt 实现 Provider / implements Provider.
func (m MapProvider) GetInt(key string, defaultVal int) int {
	if m.Ints == nil {
		return defaultVal
	}
	if v, ok := m.Ints[key]; ok {
		return v
	}
	return defaultVal
}
