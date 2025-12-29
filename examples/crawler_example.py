"""
爬虫使用示例
"""
import asyncio
from crawler.scheduler import CrawlerScheduler
from crawler.realtime import RealtimeCrawler
from crawler.extractor import AIExtractor


async def example_simple_crawl():
    """简单爬取示例"""
    print("=== 简单爬取示例 ===")
    
    scheduler = CrawlerScheduler()
    
    # 创建任务
    task_id = scheduler.create_task(
        url="https://example.com",
        crawler_type="simple"
    )
    
    # 执行任务
    result = await scheduler.execute_task(task_id)
    
    print(f"标题: {result.title}")
    print(f"内容长度: {len(result.content)}")
    print(f"URL: {result.url}")


async def example_batch_crawl():
    """批量爬取示例"""
    print("\n=== 批量爬取示例 ===")
    
    scheduler = CrawlerScheduler(max_concurrent=3)
    
    urls = [
        "https://example.com",
        "https://httpbin.org/html",
    ]
    
    results = await scheduler.execute_batch(urls, crawler_type="simple")
    
    print(f"成功爬取 {len(results)} 个URL")
    for task_id, result in results.items():
        print(f"  - {result.url}: {result.title[:50]}")


async def example_ai_extract():
    """AI信息提取示例"""
    print("\n=== AI信息提取示例 ===")
    
    scheduler = CrawlerScheduler()
    extractor = AIExtractor()
    
    # 爬取内容
    task_id = scheduler.create_task("https://example.com")
    result = await scheduler.execute_task(task_id)
    
    # 提取摘要
    summary = await extractor.extract_summary(result.content)
    print(f"摘要: {summary}")
    
    # 提取关键词
    keywords = await extractor.extract_keywords(result.content, count=5)
    print(f"关键词: {', '.join(keywords)}")
    
    # 提取实体
    entities = await extractor.extract_entities(result.content)
    print(f"实体: {entities}")


async def example_realtime_monitor():
    """实时监控示例"""
    print("\n=== 实时监控示例 ===")
    
    realtime = RealtimeCrawler()
    
    # 定义变化回调
    async def on_change(result, extracted_info):
        print(f"\n检测到变化: {result.url}")
        print(f"标题: {result.title}")
        if extracted_info:
            print(f"提取信息: {extracted_info}")
    
    # 添加监控任务
    task_id = realtime.add_monitor(
        url="https://example.com",
        interval=60,  # 每60秒检查一次
        callback=on_change
    )
    
    print(f"开始监控，任务ID: {task_id}")
    print("（实际使用中会持续运行，这里只演示5秒）")
    
    # 启动监控
    await realtime.start()
    
    # 运行5秒后停止
    await asyncio.sleep(5)
    await realtime.stop()
    
    print("监控已停止")


async def main():
    """运行所有示例"""
    await example_simple_crawl()
    await example_batch_crawl()
    await example_ai_extract()
    await example_realtime_monitor()


if __name__ == "__main__":
    asyncio.run(main())

