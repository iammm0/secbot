"""
智能搜索工具：搜索 → 访问结果页面 → AI 摘要 → 综合报告
"""
import asyncio
from typing import Any, Dict, List
from tools.base import BaseTool, ToolResult
from utils.logger import logger


class SmartSearchTool(BaseTool):
    """智能搜索工具：搜索关键词 → 自动访问 top-N 结果页面 → AI 生成摘要 → 汇总答案"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="smart_search",
            description=(
                "智能联网搜索：根据关键词搜索互联网，自动访问搜索结果页面并用 AI 提取摘要，"
                "最终返回综合研究报告。"
                "参数: query(搜索关键词), max_results(访问页面数,默认3), "
                "summarize(是否AI总结,默认true)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        query = kwargs.get("query", "").strip()
        if not query:
            return ToolResult(success=False, result=None, error="缺少参数: query")

        max_results = int(kwargs.get("max_results", 3))
        summarize = kwargs.get("summarize", True)
        if isinstance(summarize, str):
            summarize = summarize.lower() in ("true", "1", "yes")

        try:
            # 1. 搜索
            search_results = await self._search(query, max_results)
            if not search_results:
                return ToolResult(
                    success=True,
                    result={"query": query, "message": "未找到相关搜索结果", "results": []},
                )

            # 2. 并发访问搜索结果页面并提取内容
            page_contents = await self._fetch_pages(search_results)

            # 3. AI 摘要（可选）
            if summarize and page_contents:
                summary = await self._summarize(query, page_contents)
            else:
                summary = ""

            # 4. 组装结果
            results = []
            for i, sr in enumerate(search_results):
                entry = {
                    "title": sr.get("title", ""),
                    "url": sr.get("url", ""),
                    "snippet": sr.get("snippet", ""),
                }
                if i < len(page_contents) and page_contents[i]:
                    entry["page_content"] = page_contents[i][:1500]
                results.append(entry)

            return ToolResult(
                success=True,
                result={
                    "query": query,
                    "total": len(results),
                    "results": results,
                    "ai_summary": summary,
                },
            )

        except Exception as e:
            logger.error(f"SmartSearchTool 错误: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    # ------------------------------------------------------------------
    # 内部方法
    # ------------------------------------------------------------------

    async def _search(self, query: str, max_results: int) -> List[Dict[str, str]]:
        """使用 DuckDuckGo 搜索"""
        try:
            from duckduckgo_search import DDGS

            loop = asyncio.get_event_loop()

            def _do_search():
                with DDGS() as ddgs:
                    return list(ddgs.text(query, max_results=max_results))

            raw = await loop.run_in_executor(None, _do_search)
            results = []
            for r in raw:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", r.get("link", "")),
                    "snippet": r.get("body", r.get("snippet", "")),
                })
            return results
        except ImportError:
            logger.warning("duckduckgo-search 未安装，尝试 HTML 抓取")
            return await self._search_html_fallback(query, max_results)
        except Exception as e:
            logger.error(f"搜索失败: {e}")
            return []

    async def _search_html_fallback(self, query: str, max_results: int) -> List[Dict[str, str]]:
        """通过 DuckDuckGo Lite HTML 页面抓取搜索结果（fallback）"""
        import re
        from urllib.request import Request, urlopen
        from urllib.parse import quote_plus

        loop = asyncio.get_event_loop()

        def _fetch():
            url = f"https://lite.duckduckgo.com/lite/?q={quote_plus(query)}"
            req = Request(url)
            req.add_header("User-Agent", "Mozilla/5.0 (compatible; HackBot/1.0)")
            with urlopen(req, timeout=15) as resp:
                return resp.read().decode(errors="ignore")

        html = await loop.run_in_executor(None, _fetch)

        results = []
        link_pattern = re.compile(
            r'<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>(.+?)</a>',
            re.DOTALL,
        )
        snippet_pattern = re.compile(
            r'<td[^>]*class="result-snippet"[^>]*>(.+?)</td>',
            re.DOTALL,
        )
        links = link_pattern.findall(html)
        snippets = snippet_pattern.findall(html)

        for i, (url, title) in enumerate(links[:max_results]):
            title_clean = re.sub(r"<[^>]+>", "", title).strip()
            snippet = ""
            if i < len(snippets):
                snippet = re.sub(r"<[^>]+>", "", snippets[i]).strip()
            if url.startswith("http"):
                results.append({"title": title_clean, "url": url, "snippet": snippet})

        return results

    async def _fetch_pages(self, search_results: List[Dict[str, str]]) -> List[str]:
        """并发访问搜索结果页面，提取纯文本内容"""
        tasks = [self._fetch_page(sr.get("url", "")) for sr in search_results]
        return await asyncio.gather(*tasks, return_exceptions=False)

    async def _fetch_page(self, url: str) -> str:
        """获取单个页面的纯文本内容"""
        if not url:
            return ""
        try:
            import httpx
            from bs4 import BeautifulSoup

            async with httpx.AsyncClient(
                timeout=15, follow_redirects=True, verify=False,
                headers={"User-Agent": "Mozilla/5.0 (compatible; HackBot/2.0)"},
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                html = resp.text

            soup = BeautifulSoup(html, "html.parser")
            # 移除无用标签
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            # 去除过多空行
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            return "\n".join(lines[:200])  # 限制行数

        except Exception as e:
            logger.warning(f"获取页面 {url} 失败: {e}")
            return ""

    async def _summarize(self, query: str, page_contents: List[str]) -> str:
        """使用 AI 对多个页面内容进行综合摘要"""
        # 合并所有页面内容
        combined = ""
        for i, content in enumerate(page_contents):
            if content:
                combined += f"\n--- 来源 {i + 1} ---\n{content[:2000]}\n"

        if not combined.strip():
            return "未能成功获取页面内容，无法生成摘要。"

        prompt = f"""请根据以下从互联网搜索获取的多个来源内容，对用户的查询生成一个全面、准确的综合摘要。

用户查询: {query}

搜索结果内容:
{combined[:6000]}

要求:
1. 综合多个来源的信息
2. 直接回答用户的查询
3. 如有矛盾信息，指出不同观点
4. 摘要控制在 300 字以内
5. 使用中文回答

综合摘要:"""

        try:
            import httpx
            from hackbot_config import settings

            base_url = settings.ollama_base_url
            model = settings.ollama_model
            provider = (settings.llm_provider or "ollama").strip().lower()

            if provider == "deepseek":
                # 使用 DeepSeek API
                if not settings.deepseek_api_key:
                    return "AI 摘要不可用：未配置 DEEPSEEK_API_KEY"

                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.deepseek_api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": settings.deepseek_model,
                            "messages": [
                                {"role": "system", "content": "你是一个专业的信息研究助手，擅长综合多个来源信息给出准确的摘要。"},
                                {"role": "user", "content": prompt},
                            ],
                            "stream": False,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            else:
                # 使用 Ollama API
                async with httpx.AsyncClient(timeout=300.0) as client:
                    resp = await client.post(
                        f"{base_url}/api/chat",
                        json={
                            "model": model,
                            "messages": [
                                {"role": "system", "content": "你是一个专业的信息研究助手，擅长综合多个来源信息给出准确的摘要。"},
                                {"role": "user", "content": prompt},
                            ],
                            "stream": False,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return data.get("message", {}).get("content", "").strip()

        except Exception as e:
            logger.error(f"AI 摘要失败: {e}")
            return f"AI 摘要失败: {e}"

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "query": {"type": "string", "description": "搜索关键词", "required": True},
                "max_results": {"type": "integer", "description": "访问页面数量（默认 3）", "default": 3},
                "summarize": {"type": "boolean", "description": "是否使用 AI 生成综合摘要（默认 true）", "default": True},
            },
        }
