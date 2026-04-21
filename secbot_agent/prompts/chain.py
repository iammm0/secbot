"""
提示词链管理
"""
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from utils.logger import logger


@dataclass
class PromptNode:
    """提示词节点"""
    name: str
    content: str
    order: int = 0
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class PromptChain:
    """提示词链：多个提示词的组合"""

    def __init__(self, name: str = "default"):
        self.name = name
        self.nodes: List[PromptNode] = []

    def add(self, name: str, content: str, order: int = 0, metadata: Optional[Dict] = None):
        """添加提示词节点"""
        node = PromptNode(name=name, content=content, order=order, metadata=metadata or {})
        self.nodes.append(node)
        # 按order排序
        self.nodes.sort(key=lambda x: x.order)
        logger.debug(f"添加提示词节点: {name} (order: {order})")

    def remove(self, name: str):
        """移除提示词节点"""
        self.nodes = [n for n in self.nodes if n.name != name]
        logger.debug(f"移除提示词节点: {name}")

    def get_combined(self, separator: str = "\n\n") -> str:
        """获取组合后的提示词"""
        if not self.nodes:
            return ""

        contents = [node.content for node in self.nodes]
        return separator.join(contents)

    def get_node(self, name: str) -> Optional[PromptNode]:
        """获取指定节点"""
        for node in self.nodes:
            if node.name == name:
                return node
        return None

    def update_node(self, name: str, content: Optional[str] = None, order: Optional[int] = None):
        """更新节点"""
        node = self.get_node(name)
        if node:
            if content is not None:
                node.content = content
            if order is not None:
                node.order = order
                self.nodes.sort(key=lambda x: x.order)
            logger.debug(f"更新提示词节点: {name}")
        else:
            logger.warning(f"提示词节点不存在: {name}")

    def clear(self):
        """清空所有节点"""
        self.nodes.clear()
        logger.debug("清空提示词链")

    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "name": self.name,
            "nodes": [
                {
                    "name": node.name,
                    "content": node.content,
                    "order": node.order,
                    "metadata": node.metadata
                }
                for node in self.nodes
            ]
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "PromptChain":
        """从字典创建"""
        chain = cls(name=data.get("name", "default"))
        for node_data in data.get("nodes", []):
            chain.add(
                name=node_data["name"],
                content=node_data["content"],
                order=node_data.get("order", 0),
                metadata=node_data.get("metadata", {})
            )
        return chain


class PromptChainBuilder:
    """提示词链构建器"""

    def __init__(self, name: str = "default"):
        self.chain = PromptChain(name=name)

    def add_role(self, role: str, order: int = 0) -> "PromptChainBuilder":
        """添加角色定义"""
        self.chain.add(f"role_{order}", role, order=order)
        return self

    def add_instruction(self, instruction: str, order: int = 10) -> "PromptChainBuilder":
        """添加指令"""
        self.chain.add(f"instruction_{order}", instruction, order=order)
        return self

    def add_context(self, context: str, order: int = 20) -> "PromptChainBuilder":
        """添加上下文"""
        self.chain.add(f"context_{order}", context, order=order)
        return self

    def add_constraint(self, constraint: str, order: int = 30) -> "PromptChainBuilder":
        """添加约束"""
        self.chain.add(f"constraint_{order}", constraint, order=order)
        return self

    def add_example(self, example: str, order: int = 40) -> "PromptChainBuilder":
        """添加示例"""
        self.chain.add(f"example_{order}", example, order=order)
        return self

    def build(self) -> PromptChain:
        """构建提示词链"""
        return self.chain

