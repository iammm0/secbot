"""
Payload生成器基类
"""
from typing import Dict, List, Optional
from abc import ABC, abstractmethod


class PayloadGenerator(ABC):
    """Payload生成器基类"""
    
    @abstractmethod
    def generate(self, payload_type: str, options: Optional[Dict] = None) -> List[str]:
        """生成payload"""
        pass