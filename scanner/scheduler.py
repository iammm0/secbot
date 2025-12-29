"""
攻击任务调度器
"""
import asyncio
from typing import Dict, List, Callable, Optional
from datetime import datetime, timedelta
from utils.logger import logger


class AttackScheduler:
    """攻击任务调度器：定时执行网络攻击测试"""
    
    def __init__(self):
        self.tasks: Dict[str, Dict] = {}
        self.running = False
        self.scheduler_task: Optional[asyncio.Task] = None
    
    def add_task(
        self,
        task_id: str,
        target: str,
        attack_type: str,
        schedule: Dict,  # {"type": "interval"/"cron", "value": ...}
        attack_config: Dict
    ) -> str:
        """添加定时攻击任务"""
        task = {
            "task_id": task_id,
            "target": target,
            "attack_type": attack_type,
            "schedule": schedule,
            "config": attack_config,
            "created_at": datetime.now(),
            "last_run": None,
            "next_run": self._calculate_next_run(schedule),
            "enabled": True,
            "run_count": 0
        }
        
        self.tasks[task_id] = task
        logger.info(f"添加攻击任务: {task_id}, 目标: {target}, 类型: {attack_type}")
        return task_id
    
    def _calculate_next_run(self, schedule: Dict) -> datetime:
        """计算下次运行时间"""
        now = datetime.now()
        schedule_type = schedule.get("type")
        value = schedule.get("value")
        
        if schedule_type == "interval":
            # 间隔执行（秒）
            return now + timedelta(seconds=value)
        elif schedule_type == "daily":
            # 每天执行
            hour = value.get("hour", 0)
            minute = value.get("minute", 0)
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            return next_run
        elif schedule_type == "weekly":
            # 每周执行
            day = value.get("day", 0)  # 0=Monday
            hour = value.get("hour", 0)
            minute = value.get("minute", 0)
            days_ahead = day - now.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            next_run = now + timedelta(days=days_ahead)
            next_run = next_run.replace(hour=hour, minute=minute, second=0, microsecond=0)
            return next_run
        else:
            return now + timedelta(hours=1)
    
    def remove_task(self, task_id: str) -> bool:
        """移除任务"""
        if task_id in self.tasks:
            del self.tasks[task_id]
            logger.info(f"移除攻击任务: {task_id}")
            return True
        return False
    
    def enable_task(self, task_id: str, enabled: bool = True):
        """启用/禁用任务"""
        if task_id in self.tasks:
            self.tasks[task_id]["enabled"] = enabled
            logger.info(f"{'启用' if enabled else '禁用'}攻击任务: {task_id}")
    
    def list_tasks(self) -> List[Dict]:
        """列出所有任务"""
        return list(self.tasks.values())
    
    def get_task(self, task_id: str) -> Optional[Dict]:
        """获取任务信息"""
        return self.tasks.get(task_id)
    
    async def start(self, attack_executor: Callable):
        """启动调度器"""
        if self.running:
            logger.warning("调度器已在运行")
            return
        
        self.running = True
        logger.info("攻击任务调度器已启动")
        
        while self.running:
            try:
                now = datetime.now()
                
                for task_id, task in list(self.tasks.items()):
                    if not task["enabled"]:
                        continue
                    
                    # 检查是否到了执行时间
                    if task["next_run"] and now >= task["next_run"]:
                        logger.info(f"执行攻击任务: {task_id}")
                        
                        try:
                            # 执行攻击
                            await attack_executor(
                                task["attack_type"],
                                task["target"],
                                task["config"]
                            )
                            
                            # 更新任务状态
                            task["last_run"] = now
                            task["run_count"] += 1
                            task["next_run"] = self._calculate_next_run(task["schedule"])
                            
                        except Exception as e:
                            logger.error(f"执行攻击任务失败 {task_id}: {e}")
                
                # 每秒检查一次
                await asyncio.sleep(1)
                
            except Exception as e:
                logger.error(f"调度器错误: {e}")
                await asyncio.sleep(1)
    
    async def stop(self):
        """停止调度器"""
        self.running = False
        logger.info("攻击任务调度器已停止")
    
    def get_next_runs(self) -> List[Dict]:
        """获取所有任务的下次运行时间"""
        return [
            {
                "task_id": task["task_id"],
                "target": task["target"],
                "attack_type": task["attack_type"],
                "next_run": task["next_run"].isoformat() if task["next_run"] else None,
                "last_run": task["last_run"].isoformat() if task["last_run"] else None,
                "run_count": task["run_count"],
                "enabled": task["enabled"]
            }
            for task in self.tasks.values()
        ]

