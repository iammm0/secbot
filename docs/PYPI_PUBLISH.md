# 发布到 PyPI

## 前置条件

1. **PyPI 账号**：在 [pypi.org](https://pypi.org) 注册。
2. **API Token**：登录 PyPI → Account settings → API tokens → Add API token。  
   - 可先创建 “Scope: Entire account” 或只限项目 `secbot` 的 token。  
   - 创建后复制 token（只显示一次），用作下面的 Secret。

## 方式一：GitHub Actions 自动发布（推荐）

1. **在仓库中配置 Secret**  
   - GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret  
   - Name: `PYPI_PASSWORD`  
   - Value: 上一步复制的 PyPI API Token  

2. **创建 Release 触发发布**  
   - 在 `pyproject.toml` 中确认/修改 `version`（如 `1.1.0`）。  
   - 提交并推送后，在 GitHub 仓库页面：  
     - **Releases** → **Create a new release**  
     - Tag 选或新建（如 `v1.1.0`），Title 可填 `v1.1.0`，描述可选  
     - 点击 **Publish release**  
   - 触发 `.github/workflows/publish.yml`：构建 wheel/sdist → 上传 PyPI → 把构建产物附到该 Release。

3. **验证**  
   - 在 [pypi.org/project/secbot](https://pypi.org/project/secbot/) 查看是否出现新版本。  
   - 安装测试：`pip install secbot -U`，然后 `hackbot` / `secbot-config config`。

## 方式二：本地手动构建并上传

```bash
# 安装构建工具
pip install build twine

# 构建
python -m build

# 上传到 PyPI（会提示输入用户名和密码，密码填 API Token）
twine upload dist/*
```

首次上传前可在 [Test PyPI](https://test.pypi.org) 试传：`twine upload --repository testpypi dist/*`。

## 包名与入口

- **PyPI 包名**：`secbot`（在 `pyproject.toml` 的 `[project] name`）。  
- **安装后命令**：`hackbot`、`secbot`、`hackbot-server`、`secbot-server`、`secbot-config`。

## 常见问题

- **401 Unauthorized**：检查 GitHub Secret `PYPI_PASSWORD` 是否为 PyPI API Token（不是登录密码）。  
- **File already exists**：该版本已上传过，需在 `pyproject.toml` 中提高 `version` 再构建并发布。
