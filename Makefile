.PHONY: help install build clean test docker-build docker-up docker-down deploy

help:
	@echo "M-Bot 构建和部署命令"
	@echo ""
	@echo "可用命令:"
	@echo "  make install      - 安装依赖"
	@echo "  make build        - 构建 Python 包"
	@echo "  make clean        - 清理构建文件"
	@echo "  make test         - 运行测试"
	@echo "  make docker-build - 构建 Docker 镜像"
	@echo "  make docker-up    - 启动 Docker 服务"
	@echo "  make docker-down  - 停止 Docker 服务"
	@echo "  make deploy       - 部署到生产环境"

install:
	pip install --upgrade pip
	pip install -r requirements.txt
	pip install -e .

build:
	python3 -m pip install --upgrade pip build wheel
	python3 -m build

clean:
	rm -rf build/ dist/ *.egg-info/
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete

test:
	pytest tests/ -v

docker-build:
	docker build -t m-bot:latest .

docker-up:
	docker-compose -f docker-compose.prod.yml up -d

docker-down:
	docker-compose -f docker-compose.prod.yml down

deploy: clean build
	@echo "构建完成，安装方式："
	@echo "pip install dist/m_bot-1.0.0-py3-none-any.whl"

