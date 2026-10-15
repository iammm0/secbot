module github.com/iammm0/execgo/examples/fullserver

// 与本仓库同库开发时使用 replace；外部业务项目只需 require 正式版本，无需 go.work 或 replace。
// replace below is for monorepo dev only; external apps use versioned require only.

go 1.24.5

require (
	github.com/iammm0/execgo v0.0.0
	github.com/iammm0/execgo/contrib/rediscache v0.0.0
	github.com/iammm0/execgo/contrib/sqlite v0.0.0
	github.com/redis/go-redis/v9 v9.7.3
)

require (
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/ncruces/go-strftime v0.1.9 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/exp v0.0.0-20250305212735-054e65f0b394 // indirect
	golang.org/x/sys v0.39.0 // indirect
	modernc.org/libc v1.62.1 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.9.1 // indirect
	modernc.org/sqlite v1.37.0 // indirect
)

replace github.com/iammm0/execgo => ../..

replace github.com/iammm0/execgo/contrib/rediscache => ../../contrib/rediscache

replace github.com/iammm0/execgo/contrib/sqlite => ../../contrib/sqlite
