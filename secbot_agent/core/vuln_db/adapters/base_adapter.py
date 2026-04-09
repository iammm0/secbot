"""漏洞数据源适配器基类"""
from abc import ABC, abstractmethod
from typing import List, Optional

from secbot_agent.core.vuln_db.schema import UnifiedVuln


class BaseVulnAdapter(ABC):
    """所有漏洞数据源适配器的基类"""

    source_name: str = "unknown"

    @abstractmethod
    async def fetch_by_id(self, vuln_id: str) -> Optional[UnifiedVuln]:
        """按漏洞 ID 获取"""
        ...

    @abstractmethod
    async def search(self, keyword: str, limit: int = 20) -> List[UnifiedVuln]:
        """关键词搜索"""
        ...

    async def fetch_batch(
        self, ids: List[str]
    ) -> List[UnifiedVuln]:
        """批量获取（默认逐条，子类可覆盖优化）"""
        results: List[UnifiedVuln] = []
        for vid in ids:
            v = await self.fetch_by_id(vid)
            if v:
                results.append(v)
        return results
