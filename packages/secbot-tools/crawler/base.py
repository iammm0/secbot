"""
基础爬虫类
"""
import asyncio
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, List, Optional, Any

import httpx
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, Browser, Page
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

from utils.logger import logger


class CrawlResult:
    """爬取结果"""
    def __init__(
        self,
        url: str,
        content: str,
        title: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None
    ):
        self.url = url
        self.content = content
        self.title = title
        self.metadata = metadata or {}
        self.timestamp = timestamp or datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "url": self.url,
            "content": self.content,
            "title": self.title,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat()
        }


class BaseCrawler(ABC):
    """基础爬虫抽象类"""
    
    def __init__(
        self,
        name: str,
        user_agent: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        timeout: int = 30,
        max_retries: int = 3
    ):
        self.name = name
        self.user_agent = user_agent
        self.timeout = timeout
        self.max_retries = max_retries
        self.session: Optional[httpx.AsyncClient] = None
        
        logger.info(f"初始化爬虫: {self.name}")
    
    async def __aenter__(self):
        """异步上下文管理器入口"""
        self.session = httpx.AsyncClient(
            timeout=self.timeout,
            headers={"User-Agent": self.user_agent},
            follow_redirects=True
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口"""
        if self.session:
            await self.session.aclose()
    
    @abstractmethod
    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """
        爬取网页
        
        Args:
            url: 目标URL
            **kwargs: 其他参数
            
        Returns:
            爬取结果
        """
        pass
    
    async def fetch_html(self, url: str) -> str:
        """获取HTML内容"""
        if not self.session:
            raise RuntimeError("爬虫未初始化，请使用 async with 语句")
        
        for attempt in range(self.max_retries):
            try:
                response = await self.session.get(url)
                response.raise_for_status()
                return response.text
            except Exception as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"获取 {url} 失败: {e}")
                    raise
                logger.warning(f"重试 {attempt + 1}/{self.max_retries}: {url}")
                await asyncio.sleep(2 ** attempt)
        
        raise Exception(f"无法获取 {url}")
    
    def parse_html(self, html: str) -> BeautifulSoup:
        """解析HTML"""
        return BeautifulSoup(html, "html.parser")
    
    def extract_text(self, soup: BeautifulSoup, selector: Optional[str] = None) -> str:
        """提取文本内容"""
        if selector:
            elements = soup.select(selector)
            return "\n".join([elem.get_text(strip=True) for elem in elements])
        else:
            # 移除script和style标签
            for script in soup(["script", "style"]):
                script.decompose()
            return soup.get_text(separator="\n", strip=True)
    
    def extract_links(self, soup: BeautifulSoup, base_url: str) -> List[str]:
        """提取链接"""
        links = []
        for link in soup.find_all("a", href=True):
            href = link["href"]
            # 处理相对链接
            if href.startswith("/"):
                from urllib.parse import urljoin
                href = urljoin(base_url, href)
            elif not href.startswith("http"):
                continue
            links.append(href)
        return links


class SimpleCrawler(BaseCrawler):
    """简单HTTP爬虫（使用requests/httpx）"""
    
    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """爬取网页"""
        html = await self.fetch_html(url)
        soup = self.parse_html(html)
        
        # 提取标题
        title = soup.title.string if soup.title else ""
        
        # 提取主要内容
        content = self.extract_text(soup, kwargs.get("content_selector"))
        
        # 提取元数据
        metadata = {
            "links_count": len(self.extract_links(soup, url)),
            "html_length": len(html)
        }
        
        return CrawlResult(
            url=url,
            content=content,
            title=title,
            metadata=metadata
        )


class SeleniumCrawler(BaseCrawler):
    """Selenium爬虫（支持JavaScript渲染）"""
    
    def __init__(self, name: str, headless: bool = True, **kwargs):
        super().__init__(name, **kwargs)
        self.headless = headless
        self.driver: Optional[webdriver.Chrome] = None
    
    def _init_driver(self):
        """初始化Selenium驱动"""
        options = Options()
        if self.headless:
            options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument(f"--user-agent={self.user_agent}")
        
        self.driver = webdriver.Chrome(options=options)
        self.driver.set_page_load_timeout(self.timeout)
    
    async def crawl(self, url: str, wait_time: int = 2, **kwargs) -> CrawlResult:
        """爬取网页（支持JavaScript）"""
        if not self.driver:
            self._init_driver()
        
        # 在事件循环中运行同步代码
        loop = asyncio.get_event_loop()
        
        def _crawl_sync():
            self.driver.get(url)
            # 等待页面加载
            import time
            time.sleep(wait_time)
            return self.driver.page_source
        
        html = await loop.run_in_executor(None, _crawl_sync)
        soup = self.parse_html(html)
        
        title = self.driver.title if self.driver else ""
        content = self.extract_text(soup, kwargs.get("content_selector"))
        
        return CrawlResult(
            url=url,
            content=content,
            title=title,
            metadata={"rendered": True}
        )
    
    def close(self):
        """关闭驱动"""
        if self.driver:
            self.driver.quit()
            self.driver = None


class PlaywrightCrawler(BaseCrawler):
    """Playwright爬虫（异步，支持JavaScript）"""
    
    def __init__(self, name: str, headless: bool = True, **kwargs):
        super().__init__(name, **kwargs)
        self.headless = headless
        self.browser: Optional[Browser] = None
        self.playwright = None
    
    async def _init_browser(self):
        """初始化Playwright浏览器"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=self.headless)
    
    async def crawl(self, url: str, wait_time: int = 2000, **kwargs) -> CrawlResult:
        """爬取网页"""
        if not self.browser:
            await self._init_browser()
        
        page: Page = await self.browser.new_page()
        
        try:
            await page.goto(url, wait_until="networkidle", timeout=self.timeout * 1000)
            await page.wait_for_timeout(wait_time)
            
            # 获取页面内容
            title = await page.title()
            html = await page.content()
            
            soup = self.parse_html(html)
            content = self.extract_text(soup, kwargs.get("content_selector"))
            
            return CrawlResult(
                url=url,
                content=content,
                title=title,
                metadata={"rendered": True, "wait_time": wait_time}
            )
        finally:
            await page.close()
    
    async def close(self):
        """关闭浏览器"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

