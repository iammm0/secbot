.PHONY: build run test clean tidy

BINARY  := secbot
SRC     := ./cmd/secbot

build:
	go build -o bin/$(BINARY) $(SRC)

run:
	go run $(SRC)

test:
	go test ./... -v

clean:
	rm -rf bin/

tidy:
	go mod tidy

lint:
	golangci-lint run ./...

# 跨平台编译
build-linux:
	GOOS=linux GOARCH=amd64 go build -o bin/$(BINARY)-linux-amd64 $(SRC)

build-darwin:
	GOOS=darwin GOARCH=arm64 go build -o bin/$(BINARY)-darwin-arm64 $(SRC)

build-windows:
	GOOS=windows GOARCH=amd64 go build -o bin/$(BINARY)-windows-amd64.exe $(SRC)

build-all: build-linux build-darwin build-windows
