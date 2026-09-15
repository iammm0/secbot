# 发布与版本

## 发布渠道

当前 **只从 `release` 发版**。

| 渠道 | 说明 |
| --- | --- |
| **GitHub Releases `.tgz`** | 唯一用户安装包（NestJS + TUI + Web / 桌面端） |
| **npmjs** | ❌ 不使用 · `@opensec/secbot` 未公开发布 |
| **PyPI / `pypi-release`** | 已冻结，不再发新版 |
| **`pure-go`** | 已冻结，无正式 Release |

## 用户安装（v2）

```bash
# 从 Releases 下载 opensec-secbot-<version>.tgz
npm install -g ./opensec-secbot-2.0.0-b2.tgz
secbot
```

## 维护者发布流程

1. 在 `release` 分支确认 `package.json` 的 `version`  
2. 打 tag 并推送：

```bash
git tag v2.0.0
git push origin v2.0.0
```

3. **Release** workflow 自动：CI → `npm run release:pack` → 上传 `.tgz` 到 GitHub Release  

`package.json` version 必须与 tag 一致（`v2.0.0` ↔ `2.0.0`）。

### 预发布版本

版本号含 `-`（如 `2.0.0-b2`）会在 GitHub Release 标记为 **prerelease**。

## 本地验证

```bash
npm ci
npm run typecheck && npm run lint && npm run format:check && npm test
npm run release:verify
npm run release:pack
```

## 版本叙事

| 时代 | 版本 | 说明 |
| --- | --- | --- |
| Python Legacy（已冻结） | v1.x | 见 [[Product-Lines|分支策略]] |
| TS Beta | v2.0.0-b* | `release` 上的预览包 |
| TS GA（计划） | v2.0.0+ | 从 `release` 正式宣发 |

## CI 说明

- **Release workflow**：tag 触发；使用 Node 24 兼容 actions（upload/download-artifact v6/v7，`action-gh-release@v3`）
- **CI workflow**：监听 **`release`**（其他功能分支需自行验证）

## 相关

- 仓库 [docs/RELEASE.md](https://github.com/iammm0/secbot/blob/release/docs/RELEASE.md)
- [[Installation|安装指南]]
