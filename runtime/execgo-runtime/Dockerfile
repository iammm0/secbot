# 快速原型镜像：多阶段构建 release 二进制，默认监听 8080，数据目录 /data。
FROM rust:bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/execgo-runtime /usr/local/bin/execgo-runtime
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/execgo-runtime", "serve", "--listen-addr", "0.0.0.0:8080", "--data-dir", "/data"]
