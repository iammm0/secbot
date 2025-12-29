"""
工具描述生成器：为 LangChain Agent 生成工具描述
"""
import json
from typing import List, Dict, Any
from tools.base import BaseTool
from utils.logger import logger


class ToolDescriptionGenerator:
    """工具描述生成器：生成工具描述供 LangChain Agent 使用"""
    
    def __init__(self, tools: List[BaseTool]):
        """
        初始化工具描述生成器
        
        Args:
            tools: 工具列表
        """
        self.tools = {tool.name: tool for tool in tools}
        logger.info(f"工具描述生成器初始化，可用工具: {list(self.tools.keys())}")
    
    def get_tools_description(self, format: str = "text") -> str:
        """
        获取所有工具的文本描述，用于提示词
        
        Args:
            format: 描述格式 ("text" 或 "markdown")
            
        Returns:
            工具描述文本
        """
        if format == "markdown":
            return self._get_markdown_description()
        else:
            return self._get_text_description()
    
    def _get_text_description(self) -> str:
        """获取纯文本格式的工具描述"""
        descriptions = []
        for tool_name, tool in self.tools.items():
            schema = tool.get_schema()
            descriptions.append(f"- {tool_name}: {tool.description}")
            if "parameters" in schema:
                params = schema["parameters"]
                if params:
                    descriptions.append(f"  参数: {json.dumps(params, ensure_ascii=False, indent=2)}")
        return "\n".join(descriptions)
    
    def _get_markdown_description(self) -> str:
        """获取 Markdown 格式的工具描述"""
        descriptions = []
        for tool_name, tool in self.tools.items():
            schema = tool.get_schema()
            descriptions.append(f"### {tool_name}\n{tool.description}")
            if "parameters" in schema:
                params = schema["parameters"]
                if params:
                    descriptions.append(f"\n**参数:**\n```json\n{json.dumps(params, ensure_ascii=False, indent=2)}\n```")
            descriptions.append("")  # 空行分隔
        return "\n".join(descriptions)
    
    def get_tools_summary(self) -> str:
        """
        获取工具摘要（仅名称和简短描述）
        
        Returns:
            工具摘要文本
        """
        summaries = [f"- {name}: {tool.description}" for name, tool in self.tools.items()]
        return "\n".join(summaries)
    
    def get_tools_for_prompt(self) -> str:
        """
        获取用于系统提示词的工具描述（优化格式）
        
        Returns:
            优化的工具描述文本
        """
        descriptions = []
        descriptions.append("【可用工具】")
        descriptions.append("你可以使用以下工具执行实际操作：\n")
        
        for tool_name, tool in self.tools.items():
            schema = tool.get_schema()
            descriptions.append(f"**{tool_name}**")
            descriptions.append(f"  描述: {tool.description}")
            
            if "parameters" in schema:
                params = schema["parameters"]
                if params:
                    descriptions.append("  参数:")
                    for param_name, param_info in params.items():
                        param_type = param_info.get("type", "string")
                        param_desc = param_info.get("description", "")
                        required = param_info.get("required", False)
                        default = param_info.get("default", "")
                        
                        param_line = f"    - {param_name} ({param_type})"
                        if param_desc:
                            param_line += f": {param_desc}"
                        if required:
                            param_line += " [必需]"
                        elif default:
                            param_line += f" [默认: {default}]"
                        descriptions.append(param_line)
            descriptions.append("")  # 空行分隔
        
        return "\n".join(descriptions)
    
    def get_tools_count(self) -> int:
        """获取工具数量"""
        return len(self.tools)
    
    def get_tool_names(self) -> List[str]:
        """获取所有工具名称"""
        return list(self.tools.keys())

