"""
DuckDuckGo 搜索客户端：基于 ddgs 库的统一搜索接口
支持 ddgs（推荐）与 duckduckgo-search（兼容），失败时回退到 HTML 抓取
"""
import asyncio
import re
from typing import List, Tuple
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from utils.logger import logger


def _normalize_result(r: dict) -> dict:
    """将 ddgs/duckduckgo-search 返回格式统一为 {title, url, snippet}"""
    return {
        "title": r.get("title", ""),
        "url": r.get("href", r.get("link", r.get("url", ""))),
        "snippet": r.get("body", r.get("snippet", "")),
    }


def _search_ddgs_sync(query: str, max_results: int) -> List[dict]:
    """同步执行 ddgs 搜索（ddgs 库，推荐）"""
    from ddgs import DDGS

    raw = DDGS().text(query, max_results=max_results)
    return [_normalize_result(r) for r in raw]


def _search_duckduckgo_search_sync(query: str, max_results: int) -> List[dict]:
    """同步执行 duckduckgo-search 库搜索（兼容旧版）"""
    from duckduckgo_search import DDGS

    with DDGS() as ddgs:
        raw = list(ddgs.text(query, max_results=max_results))
    return [_normalize_result(r) for r in raw]


def _search_html_sync(query: str, max_results: int) -> List[dict]:
    """同步执行 DuckDuckGo Lite HTML 抓取（fallback）"""
    url = f"https://lite.duckduckgo.com/lite/?q={quote_plus(query)}"
    req = Request(url)
    req.add_header("User-Agent", "Mozilla/5.0 (compatible; SecBot/1.0)")
    with urlopen(req, timeout=15) as resp:
        html = resp.read().decode(errors="ignore")

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


async def search(
    query: str,
    max_results: int = 5,
) -> Tuple[List[dict], str]:
    """
    执行网络搜索，返回 (results, engine)。
    results: [{title, url, snippet}, ...]
    engine: "ddgs" | "duckduckgo_search" | "duckduckgo_lite"
    """
    loop = asyncio.get_event_loop()

    # 1. 优先使用 ddgs（推荐）
    try:
        raw = await loop.run_in_executor(
            None, _search_ddgs_sync, query, max_results
        )
        if raw:
            return raw, "ddgs"
    except ImportError:
        logger.debug("ddgs 未安装，尝试 duckduckgo-search")
    except Exception as e:
        logger.warning(f"ddgs 搜索失败: {e}")

    # 2. 尝试 duckduckgo-search（兼容）
    try:
        raw = await loop.run_in_executor(
            None, _search_duckduckgo_search_sync, query, max_results
        )
        if raw:
            return raw, "duckduckgo_search"
    except ImportError:
        logger.debug("duckduckgo-search 未安装")
    except Exception as e:
        logger.warning(f"duckduckgo-search 搜索失败: {e}")

    # 3. Fallback: HTML 抓取
    logger.debug("使用 DuckDuckGo Lite HTML 抓取")
    raw = await loop.run_in_executor(
        None, _search_html_sync, query, max_results
    )
    return raw, "duckduckgo_lite"
