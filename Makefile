.PHONY: help install build clean test docker-build docker-up docker-down deploy

help:
	@echo "Hackbot 构建和部署命令"
	@echo ""
	@echo "可用命令:"
	@echo "  make install      - 安装依赖 (使用 uv)"
	@echo "  make build        - 构建 Python 包"
	@echo "  make clean        - 清理构建文件"
	@echo "  make test         - 运行测试"
	@echo "  make docker-build - 构建 Docker 镜像"
	@echo "  make docker-up    - 启动 Docker 服务"
	@echo "  make docker-down  - 停止 Docker 服务"
	@echo "  make deploy       - 部署到生产环境"

install:
	uv sync

build:
	uv run python -m build

clean:
	rm -rf build/ dist/ *.egg-info/
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete

test:
	uv run pytest tests/ -v

docker-build:
	docker build -t hackbot:latest .

docker-up:
	docker-compose -f docker-compose.prod.yml up -d

docker-down:
	docker-compose -f docker-compose.prod.yml down

deploy: clean build
	@echo "构建完成，安装方式："
	@echo "uv pip install dist/hackbot-*.whl"

