"""
虚拟浏览器会话工具：只读搜索与页面抓取（ExploreAgent 专用子集）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import httpx

from tools.base import BaseTool, ToolResult
from utils.logger import logger


@dataclass
class _BrowserState:
    url: str = ""
    history: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    last_search_results: List[Dict[str, str]] = field(default_factory=list)
    stash_text: str = ""


class BrowserSessionTool(BaseTool):
    """
    action: open | follow | back | search | read | note | close
    均需 session_id。read 使用当前 URL 抓取正文片段。
    """

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="browser_session",
            description=(
                "类人只读浏览。参数: session_id(必填), "
                "action(open|follow|back|search|read|note|close), "
                "url( open/follow), query(search), text(note), max_chars(read,默认8000)。"
            ),
        )
        self._sessions: Dict[str, _BrowserState] = {}

    def close_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def _state(self, session_id: str) -> _BrowserState:
        if session_id not in self._sessions:
            self._sessions[session_id] = _BrowserState()
        return self._sessions[session_id]

    async def execute(self, **kwargs) -> ToolResult:
        sid = (kwargs.get("session_id") or "").strip()
        action = (kwargs.get("action") or "").strip().lower()
        if not sid:
            return ToolResult(success=False, result=None, error="缺少 session_id")
        st = self._state(sid)

        try:
            if action == "close":
                self.close_session(sid)
                return ToolResult(success=True, result={"closed": True})

            if action == "search":
                q = (kwargs.get("query") or "").strip()
                if not q:
                    return ToolResult(success=False, result=None, error="search 需要 query")
                from tools.web_search_ddgs import search as ddgs_search

                results, engine = await ddgs_search(q, max_results=6)
                st.last_search_results = results
                return ToolResult(
                    success=True,
                    result={"engine": engine, "results": results},
                )

            if action == "open":
                url = (kwargs.get("url") or "").strip()
                if not url:
                    return ToolResult(success=False, result=None, error="open 需要 url")
                return await self._navigate(st, url, push=True)

            if action == "follow":
                url = (kwargs.get("url") or "").strip()
                idx = kwargs.get("index")
                if not url and idx is not None:
                    try:
                        i = int(idx)
                        if 0 <= i < len(st.last_search_results):
                            url = st.last_search_results[i].get("url", "")
                    except (TypeError, ValueError):
                        pass
                if not url:
                    return ToolResult(
                        success=False, result=None, error="follow 需要 url 或合法 index"
                    )
                if not url.startswith("http"):
                    url = urljoin(st.url or "https:///", url)
                return await self._navigate(st, url, push=True)

            if action == "back":
                if len(st.history) >= 2:
                    st.history.pop()
                    prev = st.history[-1]
                    return await self._navigate(st, prev, push=False)
                return ToolResult(
                    success=False, result=None, error="无可返回的历史"
                )

            if action == "read":
                max_chars = int(kwargs.get("max_chars") or 8000)
                if not st.url:
                    return ToolResult(
                        success=False, result=None, error="先 open/follow 再 read"
                    )
                text, title = await self._fetch_text(st.url)
                st.stash_text = text[:max_chars]
                return ToolResult(
                    success=True,
                    result={
                        "url": st.url,
                        "title": title,
                        "text_excerpt": st.stash_text,
                    },
                )

            if action == "note":
                note = (kwargs.get("text") or "").strip()
                if note:
                    st.notes.append(note[:2000])
                return ToolResult(success=True, result={"notes": list(st.notes)})

            return ToolResult(
                success=False,
                result=None,
                error=f"未知 action: {action}",
            )
        except Exception as e:
            logger.warning(f"browser_session: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    async def _navigate(
        self, st: _BrowserState, url: str, push: bool
    ) -> ToolResult:
        text, title = await self._fetch_text(url)
        st.url = url
        if push:
            if not st.history or st.history[-1] != url:
                st.history.append(url)
        return ToolResult(
            success=True,
            result={"url": url, "title": title, "preview": text[:2500]},
        )

    async def _fetch_text(self, url: str) -> tuple[str, str]:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; SecBot-Explore/1.0)"}
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=20.0, headers=headers
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
        title = ""
        m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
        if m:
            title = re.sub(r"\s+", " ", m.group(1)).strip()
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
        except Exception:
            text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip(), title
