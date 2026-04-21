"""
网页内容 AI 智能提取工具：支持纯文本 / 结构化 / 自定义 schema 三种提取模式
"""
import json
from typing import Any, Dict
from tools.base import BaseTool, ToolResult
from utils.logger import logger


class PageExtractTool(BaseTool):
    """网页内容智能提取工具：给定 URL，AI 智能提取关键信息"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="page_extract",
            description=(
                "智能提取网页内容。支持三种模式: "
                "text(纯文本提取)、structured(结构化数据如表格/列表)、custom(自定义提取schema)。"
                "参数: url(目标URL), mode(text/structured/custom,默认text), "
                "schema(custom模式的提取模式dict), css_selector(可选CSS选择器聚焦内容)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        url = kwargs.get("url", "").strip()
        if not url:
            return ToolResult(success=False, result=None, error="缺少参数: url")

        mode = kwargs.get("mode", "text").strip().lower()
        schema = kwargs.get("schema")
        css_selector = kwargs.get("css_selector", "").strip() or None

        if mode not in ("text", "structured", "custom"):
            return ToolResult(
                success=False, result=None,
                error=f"不支持的模式: {mode}，请使用 text/structured/custom",
            )

        try:
            # 1. 获取页面
            html, title = await self._fetch_page(url)
            if not html:
                return ToolResult(success=False, result=None, error=f"无法获取页面: {url}")

            # 2. 解析 HTML
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")

            # CSS 选择器聚焦
            if css_selector:
                elements = soup.select(css_selector)
                if elements:
                    # 重建一个只包含选中元素的 soup
                    combined_html = "\n".join(str(el) for el in elements)
                    soup = BeautifulSoup(combined_html, "html.parser")

            # 3. 根据模式提取
            if mode == "text":
                result = await self._extract_text(soup, url, title)
            elif mode == "structured":
                result = await self._extract_structured(soup, url, title)
            elif mode == "custom":
                if not schema:
                    return ToolResult(
                        success=False, result=None,
                        error="custom 模式需要提供 schema 参数",
                    )
                result = await self._extract_custom(soup, url, title, schema)
            else:
                result = await self._extract_text(soup, url, title)

            return ToolResult(success=True, result=result)

        except Exception as e:
            logger.error(f"PageExtractTool 错误: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    # ------------------------------------------------------------------
    # 页面获取
    # ------------------------------------------------------------------

    async def _fetch_page(self, url: str) -> tuple:
        """获取页面 HTML 和标题"""
        try:
            import httpx

            async with httpx.AsyncClient(
                timeout=20,
                follow_redirects=True,
                verify=False,
                headers={"User-Agent": "Mozilla/5.0 (compatible; HackBot/2.0)"},
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                html = resp.text

            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            title = soup.title.string.strip() if soup.title and soup.title.string else ""
            return html, title

        except Exception as e:
            logger.error(f"获取页面失败 {url}: {e}")
            return "", ""

    # ------------------------------------------------------------------
    # 模式 1: 纯文本提取
    # ------------------------------------------------------------------

    async def _extract_text(self, soup, url: str, title: str) -> Dict[str, Any]:
        """纯文本模式：移除噪音，提取干净的文本内容"""
        # 移除无用标签
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        clean_text = "\n".join(lines)

        # 提取页面内链接
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            link_text = a.get_text(strip=True)
            if href.startswith("http") and link_text:
                links.append({"text": link_text[:100], "url": href})
        links = links[:20]  # 限制数量

        # 提取页面内图片
        images = []
        for img in soup.find_all("img", src=True):
            alt = img.get("alt", "").strip()
            src = img["src"]
            if src.startswith("http"):
                images.append({"alt": alt[:100], "src": src})
        images = images[:10]

        return {
            "url": url,
            "title": title,
            "content": clean_text[:5000],
            "content_length": len(clean_text),
            "links_count": len(links),
            "links": links,
            "images_count": len(images),
            "images": images,
        }

    # ------------------------------------------------------------------
    # 模式 2: 结构化数据提取
    # ------------------------------------------------------------------

    async def _extract_structured(self, soup, url: str, title: str) -> Dict[str, Any]:
        """结构化模式：提取表格、列表、标题层级等结构化数据"""
        result: Dict[str, Any] = {"url": url, "title": title}

        # 提取标题层级
        headings = []
        for level in range(1, 7):
            for h in soup.find_all(f"h{level}"):
                text = h.get_text(strip=True)
                if text:
                    headings.append({"level": level, "text": text[:200]})
        result["headings"] = headings[:50]

        # 提取表格
        tables = []
        for table in soup.find_all("table"):
            rows = []
            for tr in table.find_all("tr"):
                cells = []
                for td in tr.find_all(["td", "th"]):
                    cells.append(td.get_text(strip=True)[:200])
                if cells:
                    rows.append(cells)
            if rows:
                tables.append({"rows": rows[:50], "total_rows": len(rows)})
        result["tables"] = tables[:10]

        # 提取有序/无序列表
        lists = []
        for lst in soup.find_all(["ul", "ol"]):
            items = []
            for li in lst.find_all("li", recursive=False):
                text = li.get_text(strip=True)
                if text:
                    items.append(text[:300])
            if items:
                lists.append({
                    "type": lst.name,
                    "items": items[:30],
                    "total_items": len(items),
                })
        result["lists"] = lists[:20]

        # 提取元数据
        meta = {}
        for tag in soup.find_all("meta"):
            name = tag.get("name") or tag.get("property") or ""
            content = tag.get("content", "")
            if name and content:
                meta[name] = content[:500]
        result["meta"] = dict(list(meta.items())[:20])

        return result

    # ------------------------------------------------------------------
    # 模式 3: 自定义 schema 提取（AI 辅助）
    # ------------------------------------------------------------------

    async def _extract_custom(
        self, soup, url: str, title: str, schema: Any
    ) -> Dict[str, Any]:
        """自定义 schema 模式：使用 AI 按用户指定的字段/结构提取信息"""
        # 先获取纯文本
        for tag in soup(["script", "style"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)

        if isinstance(schema, str):
            try:
                schema = json.loads(schema)
            except json.JSONDecodeError:
                pass

        schema_str = json.dumps(schema, ensure_ascii=False, indent=2) if isinstance(schema, dict) else str(schema)

        prompt = f"""请从以下网页内容中，按照给定的提取模式提取结构化信息。

网页标题: {title}
网页URL: {url}

提取模式:
{schema_str}

网页内容:
{text[:5000]}

请以 JSON 格式返回提取结果，只返回 JSON，不要其他文字。"""

        try:
            extracted = await self._call_ai(prompt)
            # 尝试解析 JSON
            json_text = self._extract_json(extracted)
            extracted_data = json.loads(json_text)
        except Exception as e:
            logger.warning(f"AI 提取解析失败: {e}")
            extracted_data = {"raw_response": extracted if 'extracted' in dir() else str(e)}

        return {
            "url": url,
            "title": title,
            "schema": schema,
            "extracted_data": extracted_data,
        }

    # ------------------------------------------------------------------
    # AI 辅助
    # ------------------------------------------------------------------

    async def _call_ai(self, prompt: str) -> str:
        """调用 AI 模型"""
        import httpx
        from hackbot_config import settings

        provider = (settings.llm_provider or "ollama").strip().lower()

        if provider == "deepseek":
            if not settings.deepseek_api_key:
                return "{}"
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
                            {"role": "system", "content": "你是一个专业的信息提取助手，只返回 JSON 格式的结果。"},
                            {"role": "user", "content": prompt},
                        ],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "")
        else:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(
                    f"{settings.ollama_base_url}/api/chat",
                    json={
                        "model": settings.ollama_model,
                        "messages": [
                            {"role": "system", "content": "你是一个专业的信息提取助手，只返回 JSON 格式的结果。"},
                            {"role": "user", "content": prompt},
                        ],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("message", {}).get("content", "")

    @staticmethod
    def _extract_json(text: str) -> str:
        """从文本中提取 JSON 片段"""
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            return text[start:end]
        # 尝试数组
        start = text.find("[")
        end = text.rfind("]") + 1
        if start != -1 and end > start:
            return text[start:end]
        return "{}"

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "url": {"type": "string", "description": "目标 URL", "required": True},
                "mode": {
                    "type": "string",
                    "description": "提取模式: text(纯文本) / structured(结构化) / custom(自定义schema)",
                    "default": "text",
                },
                "schema": {
                    "type": "object",
                    "description": "custom 模式的提取模式定义（JSON 对象）",
                    "required": False,
                },
                "css_selector": {
                    "type": "string",
                    "description": "可选 CSS 选择器，聚焦页面特定区域",
                    "required": False,
                },
            },
        }
