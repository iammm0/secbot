"""
实时爬虫：定期监控网站变化
"""
import asyncio
from typing import List, Dict, Callable, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from secbot_agent.crawler.base import BaseCrawler, SimpleCrawler
from secbot_agent.crawler.extractor import AIExtractor
from utils.logger import logger
from utils.embeddings import OllamaEmbeddings


@dataclass
class MonitorTask:
    """监控任务"""
    url: str
    interval: int  # 检查间隔（秒）
    last_check: Optional[datetime] = None
    last_content_hash: Optional[str] = None
    callback: Optional[Callable] = None
    extractor_config: Optional[Dict] = None


class RealtimeCrawler:
    """实时爬虫：监控网站变化并提取信息"""

    def __init__(
        self,
        crawler: Optional[BaseCrawler] = None,
        extractor: Optional[AIExtractor] = None
    ):
        self.crawler = crawler or SimpleCrawler(name="RealtimeCrawler")
        self.extractor = extractor or AIExtractor()
        self.embeddings = OllamaEmbeddings()
        self.tasks: Dict[str, MonitorTask] = {}
        self.running = False
        self._task_handles: List[asyncio.Task] = []

    def add_monitor(
        self,
        url: str,
        interval: int = 300,
        callback: Optional[Callable] = None,
        extractor_config: Optional[Dict] = None
    ) -> str:
        """
        添加监控任务

        Args:
            url: 要监控的URL
            interval: 检查间隔（秒）
            callback: 变化时的回调函数
            extractor_config: 提取器配置

        Returns:
            任务ID
        """
        task_id = f"{url}_{interval}"
        task = MonitorTask(
            url=url,
            interval=interval,
            callback=callback,
            extractor_config=extractor_config
        )
        self.tasks[task_id] = task
        logger.info(f"添加监控任务: {url} (间隔: {interval}秒)")
        return task_id

    def remove_monitor(self, task_id: str):
        """移除监控任务"""
        if task_id in self.tasks:
            del self.tasks[task_id]
            logger.info(f"移除监控任务: {task_id}")

    async def _check_url(self, task: MonitorTask) -> bool:
        """
        检查URL是否有变化

        Returns:
            True if changed
        """
        try:
            async with self.crawler:
                result = await self.crawler.crawl(task.url)

            # 计算内容哈希
            import hashlib
            content_hash = hashlib.md5(result.content.encode()).hexdigest()

            # 检查是否有变化
            if task.last_content_hash and task.last_content_hash != content_hash:
                logger.info(f"检测到变化: {task.url}")

                # 提取信息
                extracted_info = {}
                if task.extractor_config:
                    extracted_info = await self.extractor.extract(
                        result.content,
                        task.extractor_config.get("schema", {}),
                        task.extractor_config.get("instruction")
                    )

                # 调用回调
                if task.callback:
                    await task.callback(result, extracted_info)

                task.last_content_hash = content_hash
                task.last_check = datetime.now()
                return True
            else:
                # 首次检查
                if not task.last_content_hash:
                    task.last_content_hash = content_hash
                    task.last_check = datetime.now()
                    logger.info(f"首次检查完成: {task.url}")

                return False

        except Exception as e:
            logger.error(f"检查 {task.url} 时出错: {e}")
            return False

    async def _monitor_loop(self, task_id: str):
        """监控循环"""
        task = self.tasks[task_id]

        while self.running and task_id in self.tasks:
            try:
                # 检查是否到了检查时间
                if task.last_check:
                    next_check = task.last_check + timedelta(seconds=task.interval)
                    if datetime.now() < next_check:
                        wait_time = (next_check - datetime.now()).total_seconds()
                        await asyncio.sleep(min(wait_time, task.interval))
                        continue

                # 执行检查
                await self._check_url(task)

                # 等待间隔时间
                await asyncio.sleep(task.interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"监控循环错误 ({task_id}): {e}")
                await asyncio.sleep(task.interval)

    async def start(self):
        """启动实时监控"""
        if self.running:
            logger.warning("实时爬虫已在运行")
            return

        self.running = True
        logger.info("启动实时爬虫监控")

        # 为每个任务创建监控循环
        for task_id in self.tasks:
            handle = asyncio.create_task(self._monitor_loop(task_id))
            self._task_handles.append(handle)

    async def stop(self):
        """停止实时监控"""
        if not self.running:
            return

        self.running = False
        logger.info("停止实时爬虫监控")

        # 取消所有任务
        for handle in self._task_handles:
            handle.cancel()

        # 等待所有任务完成
        await asyncio.gather(*self._task_handles, return_exceptions=True)
        self._task_handles.clear()

    async def check_once(self, task_id: str) -> bool:
        """立即检查一次（不等待间隔）"""
        if task_id not in self.tasks:
            logger.error(f"任务不存在: {task_id}")
            return False

        return await self._check_url(self.tasks[task_id])

    async def check_all(self):
        """立即检查所有任务"""
        results = {}
        for task_id in self.tasks:
            results[task_id] = await self.check_once(task_id)
        return results

