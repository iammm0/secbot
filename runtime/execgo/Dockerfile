# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS builder
WORKDIR /src

# Copy workspace/module definitions first (better build cache).
COPY go.mod go.sum go.work go.work.sum ./

COPY ./cmd ./cmd
COPY ./pkg ./pkg
COPY ./contrib ./contrib
COPY ./examples ./examples

# Build with gRPC enabled so the same image can serve both HTTP and gRPC.
RUN CGO_ENABLED=0 go build -tags grpc -o /out/execgo ./cmd/execgo

FROM alpine:3.20

RUN adduser -D -u 10001 -g '' appuser

RUN apk add --no-cache \
  ca-certificates \
  curl \
  wget \
  bind-tools \
  iputils

WORKDIR /app
COPY --from=builder /out/execgo ./execgo

VOLUME ["/data"]
EXPOSE 8080 50051

ENV EXECGO_ADDR=:8080 \
    EXECGO_GRPC_ADDR=:50051 \
    EXECGO_DATA_DIR=/data \
    EXECGO_MAX_CONCURRENCY=10 \
    EXECGO_SHUTDOWN_TIMEOUT=15

USER appuser

CMD ["./execgo"]

