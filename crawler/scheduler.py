"""
爬虫任务调度器
"""
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Dict, Optional

from crawler.base import CrawlResult
from crawler.realtime import RealtimeCrawler
from utils.logger import logger


class TaskStatus(Enum):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class CrawlTask:
    """爬虫任务"""
    id: str
    url: str
    crawler_type: str = "simple"  # simple, selenium, playwright
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[CrawlResult] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    metadata: Dict = field(default_factory=dict)


class CrawlerScheduler:
    """爬虫任务调度器"""
    
    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self.tasks: Dict[str, CrawlTask] = {}
        self.running_tasks: Dict[str, asyncio.Task] = {}
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.realtime_crawler: Optional[RealtimeCrawler] = None
    
    def create_task(
        self,
        url: str,
        crawler_type: str = "simple",
        metadata: Optional[Dict] = None
    ) -> str:
        """
        创建爬虫任务
        
        Args:
            url: 目标URL
            crawler_type: 爬虫类型
            metadata: 元数据
            
        Returns:
            任务ID
        """
        task_id = f"{url}_{datetime.now().timestamp()}"
        task = CrawlTask(
            id=task_id,
            url=url,
            crawler_type=crawler_type,
            metadata=metadata or {}
        )
        self.tasks[task_id] = task
        logger.info(f"创建爬虫任务: {task_id} - {url}")
        return task_id
    
    async def execute_task(self, task_id: str) -> CrawlResult:
        """执行单个任务"""
        if task_id not in self.tasks:
            raise ValueError(f"任务不存在: {task_id}")
        
        task = self.tasks[task_id]
        task.status = TaskStatus.RUNNING
        
        async with self.semaphore:
            try:
                # 创建爬虫实例
                from crawler.base import SimpleCrawler, SeleniumCrawler, PlaywrightCrawler
                
                if task.crawler_type == "selenium":
                    crawler = SeleniumCrawler(name=f"Task-{task_id}")
                elif task.crawler_type == "playwright":
                    crawler = PlaywrightCrawler(name=f"Task-{task_id}")
                else:
                    crawler = SimpleCrawler(name=f"Task-{task_id}")
                
                # 执行爬取
                async with crawler:
                    result = await crawler.crawl(task.url, **task.metadata)
                
                task.result = result
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.now()
                
                logger.info(f"任务完成: {task_id}")
                return result
                
            except Exception as e:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.completed_at = datetime.now()
                logger.error(f"任务失败: {task_id} - {e}")
                raise
    
    async def execute_task_async(self, task_id: str):
        """异步执行任务（不阻塞）"""
        task_handle = asyncio.create_task(self.execute_task(task_id))
        self.running_tasks[task_id] = task_handle
        
        try:
            await task_handle
        except Exception as e:
            logger.error(f"异步任务执行错误: {task_id} - {e}")
        finally:
            if task_id in self.running_tasks:
                del self.running_tasks[task_id]
    
    async def execute_batch(self, urls: List[str], crawler_type: str = "simple") -> Dict[str, CrawlResult]:
        """
        批量执行任务
        
        Args:
            urls: URL列表
            crawler_type: 爬虫类型
            
        Returns:
            任务ID到结果的映射
        """
        # 创建所有任务
        task_ids = [self.create_task(url, crawler_type) for url in urls]
        
        # 并发执行
        tasks = [self.execute_task_async(task_id) for task_id in task_ids]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        # 收集结果
        results = {}
        for task_id in task_ids:
            if task_id in self.tasks and self.tasks[task_id].result:
                results[task_id] = self.tasks[task_id].result
        
        return results
    
    def get_task(self, task_id: str) -> Optional[CrawlTask]:
        """获取任务"""
        return self.tasks.get(task_id)
    
    def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        """获取任务状态"""
        if task_id in self.tasks:
            return self.tasks[task_id].status
        return None
    
    def cancel_task(self, task_id: str):
        """取消任务"""
        if task_id in self.running_tasks:
            self.running_tasks[task_id].cancel()
            if task_id in self.tasks:
                self.tasks[task_id].status = TaskStatus.CANCELLED
    
    def get_realtime_crawler(self) -> RealtimeCrawler:
        """获取实时爬虫实例"""
        if not self.realtime_crawler:
            self.realtime_crawler = RealtimeCrawler()
        return self.realtime_crawler

