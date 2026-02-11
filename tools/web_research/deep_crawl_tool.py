"""
多页面深度爬取工具：从起始 URL 出发，广度优先发现并爬取相关链接
"""
import asyncio
import re
from collections import deque
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse
from tools.base import BaseTool, ToolResult
from utils.logger import logger


class DeepCrawlTool(BaseTool):
    """多页面深度爬取工具：BFS 爬取，支持深度/数量控制、URL 正则过滤、可选 AI 提取"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="deep_crawl",
            description=(
                "从起始URL出发，广度优先发现并爬取相关链接页面。"
                "参数: start_url(起始URL), max_depth(最大深度,默认2), "
                "max_pages(最大页面数,默认10), url_pattern(可选正则过滤URL), "
                "extract_info(是否AI提取摘要,默认false), same_domain(是否限同域,默认true)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        start_url = kwargs.get("start_url", "").strip()
        if not start_url:
            return ToolResult(success=False, result=None, error="缺少参数: start_url")

        max_depth = int(kwargs.get("max_depth", 2))
        max_pages = int(kwargs.get("max_pages", 10))
        url_pattern = kwargs.get("url_pattern", "").strip() or None
        extract_info = kwargs.get("extract_info", False)
        same_domain = kwargs.get("same_domain", True)

        if isinstance(extract_info, str):
            extract_info = extract_info.lower() in ("true", "1", "yes")
        if isinstance(same_domain, str):
            same_domain = same_domain.lower() in ("true", "1", "yes")

        # 限制防止滥用
        max_depth = min(max_depth, 5)
        max_pages = min(max_pages, 50)

        try:
            pages = await self._bfs_crawl(
                start_url, max_depth, max_pages, url_pattern, same_domain, extract_info
            )

            return ToolResult(
                success=True,
                result={
                    "start_url": start_url,
                    "max_depth": max_depth,
                    "pages_crawled": len(pages),
                    "pages": pages,
                },
            )

        except Exception as e:
            logger.error(f"DeepCrawlTool 错误: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    # ------------------------------------------------------------------
    # BFS 爬取核心
    # ------------------------------------------------------------------

    async def _bfs_crawl(
        self,
        start_url: str,
        max_depth: int,
        max_pages: int,
        url_pattern: Optional[str],
        same_domain: bool,
        extract_info: bool,
    ) -> List[Dict[str, Any]]:
        """广度优先爬取"""
        visited: Set[str] = set()
        results: List[Dict[str, Any]] = []
        base_domain = urlparse(start_url).netloc

        # 编译 URL 过滤正则
        pattern_re = re.compile(url_pattern) if url_pattern else None

        # BFS 队列: (url, depth)
        queue: deque = deque()
        queue.append((start_url, 0))
        visited.add(self._normalize_url(start_url))

        # 并发控制
        semaphore = asyncio.Semaphore(5)

        while queue and len(results) < max_pages:
            # 取出同一层级的所有 URL
            batch = []
            current_depth = queue[0][1] if queue else 0
            while queue and queue[0][1] == current_depth and len(batch) < max_pages - len(results):
                batch.append(queue.popleft())

            if not batch:
                break

            # 并发爬取当前批次
            tasks = [
                self._crawl_page(url, depth, semaphore, extract_info)
                for url, depth in batch
            ]
            page_results = await asyncio.gather(*tasks, return_exceptions=True)

            for (url, depth), page_result in zip(batch, page_results):
                if isinstance(page_result, Exception):
                    logger.warning(f"爬取 {url} 异常: {page_result}")
                    continue
                if page_result is None:
                    continue

                results.append(page_result)

                # 发现新链接并加入队列
                if depth < max_depth:
                    for link in page_result.get("links", []):
                        link_url = link if isinstance(link, str) else link.get("url", "")
                        normalized = self._normalize_url(link_url)
                        if normalized in visited:
                            continue

                        # 同域限制
                        if same_domain and urlparse(link_url).netloc != base_domain:
                            continue

                        # URL 正则过滤
                        if pattern_re and not pattern_re.search(link_url):
                            continue

                        visited.add(normalized)
                        queue.append((link_url, depth + 1))

                        if len(visited) > max_pages * 3:
                            break

            if len(results) >= max_pages:
                break

        return results

    async def _crawl_page(
        self,
        url: str,
        depth: int,
        semaphore: asyncio.Semaphore,
        extract_info: bool,
    ) -> Optional[Dict[str, Any]]:
        """爬取单个页面"""
        async with semaphore:
            try:
                import httpx
                from bs4 import BeautifulSoup

                async with httpx.AsyncClient(
                    timeout=15,
                    follow_redirects=True,
                    verify=False,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; HackBot/2.0)"},
                ) as client:
                    resp = await client.get(url)
                    resp.raise_for_status()

                    # 仅处理 HTML 内容
                    content_type = resp.headers.get("content-type", "")
                    if "text/html" not in content_type and "application/xhtml" not in content_type:
                        return None

                    html = resp.text

                soup = BeautifulSoup(html, "html.parser")
                title = soup.title.string.strip() if soup.title and soup.title.string else ""

                # 提取纯文本
                for tag in soup(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()
                text = soup.get_text(separator="\n", strip=True)
                lines = [line.strip() for line in text.splitlines() if line.strip()]
                content = "\n".join(lines[:100])  # 每页限制 100 行

                # 提取页面内链接
                links = []
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    if href.startswith("/"):
                        href = urljoin(url, href)
                    if href.startswith("http"):
                        links.append({"url": href, "text": a.get_text(strip=True)[:80]})
                links = links[:30]

                page_data: Dict[str, Any] = {
                    "url": url,
                    "depth": depth,
                    "title": title,
                    "content_preview": content[:800],
                    "content_length": len(content),
                    "links_found": len(links),
                    "links": links,
                }

                # 可选 AI 摘要
                if extract_info and content:
                    summary = await self._ai_summarize(title, content)
                    page_data["ai_summary"] = summary

                return page_data

            except Exception as e:
                logger.warning(f"爬取页面 {url} 失败: {e}")
                return None

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_url(url: str) -> str:
        """URL 归一化（去掉片段、尾部斜杠）"""
        parsed = urlparse(url)
        normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
        if parsed.query:
            normalized += f"?{parsed.query}"
        return normalized

    async def _ai_summarize(self, title: str, content: str) -> str:
        """AI 生成页面摘要"""
        prompt = f"""请用一两句话概括以下网页内容的主题和关键信息：

标题: {title}
内容:
{content[:2000]}

简要摘要:"""

        try:
            import httpx
            from config import settings

            provider = (settings.llm_provider or "ollama").strip().lower()

            if provider == "deepseek":
                if not settings.deepseek_api_key:
                    return ""
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.deepseek_api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": settings.deepseek_model,
                            "messages": [{"role": "user", "content": prompt}],
                            "stream": False,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            else:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    resp = await client.post(
                        f"{settings.ollama_base_url}/api/chat",
                        json={
                            "model": settings.ollama_model,
                            "messages": [{"role": "user", "content": prompt}],
                            "stream": False,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return data.get("message", {}).get("content", "").strip()

        except Exception as e:
            logger.warning(f"AI 摘要失败: {e}")
            return ""

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "start_url": {"type": "string", "description": "起始 URL", "required": True},
                "max_depth": {"type": "integer", "description": "最大爬取深度（默认 2，最大 5）", "default": 2},
                "max_pages": {"type": "integer", "description": "最大爬取页面数（默认 10，最大 50）", "default": 10},
                "url_pattern": {"type": "string", "description": "可选 URL 过滤正则表达式", "required": False},
                "extract_info": {"type": "boolean", "description": "是否使用 AI 提取每页摘要（默认 false）", "default": False},
                "same_domain": {"type": "boolean", "description": "是否限制同域爬取（默认 true）", "default": True},
            },
        }
