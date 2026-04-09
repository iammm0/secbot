"""
爬虫工具：供智能体使用
"""

from tools.base import BaseTool, ToolResult
from secbot_agent.crawler.scheduler import CrawlerScheduler
from secbot_agent.crawler.extractor import AIExtractor
from utils.logger import logger


class CrawlerTool(BaseTool):
    """爬虫工具"""

    def __init__(self):
        super().__init__(name="web_crawler", description="爬取网页内容并提取信息")
        self.scheduler = CrawlerScheduler()
        self.extractor = AIExtractor()

    async def execute(
        self,
        url: str,
        extract_info: bool = False,
        extraction_schema: dict = None,
        **kwargs,
    ) -> ToolResult:
        """
        执行爬取

        Args:
            url: 目标URL
            extract_info: 是否使用AI提取信息
            extraction_schema: 提取模式
            **kwargs: 其他参数
        """
        try:
            logger.info(f"爬取URL: {url}")

            task_id = self.scheduler.create_task(
                url, crawler_type=kwargs.get("crawler_type", "simple")
            )
            result = await self.scheduler.execute_task(task_id)

            extracted_data = {}
            if extract_info:
                if extraction_schema:
                    extracted_data = await self.extractor.extract(
                        result.content, extraction_schema
                    )
                else:
                    summary = await self.extractor.extract_summary(result.content)
                    keywords = await self.extractor.extract_keywords(result.content)
                    extracted_data = {"summary": summary, "keywords": keywords}

            return ToolResult(
                success=True,
                result={
                    "url": result.url,
                    "title": result.title,
                    "content": result.content[:1000],
                    "full_content_length": len(result.content),
                    "extracted_info": extracted_data,
                    "metadata": result.metadata,
                },
            )

        except Exception as e:
            logger.error(f"爬虫工具错误: {e}")
            return ToolResult(success=False, result=None, error=str(e))
