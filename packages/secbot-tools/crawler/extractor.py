"""
AI信息提取器
使用AI模型提取结构化信息
"""
from typing import Dict, List, Optional, Any
import json
import httpx
from hackbot_config import settings
from utils.logger import logger


class AIExtractor:
    """AI信息提取器"""
    
    def __init__(self, model: str = None):
        self.base_url = settings.ollama_base_url
        self.model = model or settings.ollama_model
    
    async def extract(
        self,
        content: str,
        extraction_schema: Dict[str, Any],
        instruction: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        从内容中提取结构化信息
        
        Args:
            content: 要提取的内容
            extraction_schema: 提取模式（定义要提取的字段）
            instruction: 额外的提取指令
            
        Returns:
            提取的结构化数据
        """
        try:
            # 构建提取提示词
            schema_str = json.dumps(extraction_schema, ensure_ascii=False, indent=2)
            
            prompt = f"""请从以下内容中提取结构化信息。

提取模式：
{schema_str}

{f'额外指令：{instruction}' if instruction else ''}

内容：
{content[:5000]}  # 限制长度避免token过多

请以JSON格式返回提取结果，只返回JSON，不要其他文字。"""
            
            # 调用Ollama
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "你是一个专业的信息提取助手，擅长从文本中提取结构化信息。只返回JSON格式的结果。"
                            },
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ],
                        "stream": False
                    }
                )
                response.raise_for_status()
                result = response.json()
            
            # 解析响应
            response_text = result.get("message", {}).get("content", "")
            
            # 尝试提取JSON
            json_text = self._extract_json(response_text)
            extracted_data = json.loads(json_text)
            
            logger.info(f"成功提取信息: {len(extracted_data)} 个字段")
            return extracted_data
            
        except Exception as e:
            logger.error(f"AI提取错误: {e}")
            return {}
    
    def _extract_json(self, text: str) -> str:
        """从文本中提取JSON"""
        # 尝试找到JSON部分
        start_idx = text.find("{")
        end_idx = text.rfind("}") + 1
        
        if start_idx != -1 and end_idx > start_idx:
            return text[start_idx:end_idx]
        
        # 如果没有找到，返回空对象
        return "{}"
    
    async def extract_entities(self, content: str) -> Dict[str, List[str]]:
        """提取实体（人名、地名、组织等）"""
        schema = {
            "人物": [],
            "地点": [],
            "组织": [],
            "时间": [],
            "事件": []
        }
        
        return await self.extract(
            content,
            schema,
            instruction="识别并分类所有重要实体"
        )
    
    async def extract_summary(self, content: str, max_length: int = 200) -> str:
        """提取摘要"""
        prompt = f"""请为以下内容生成一个简洁的摘要（不超过{max_length}字）：

{content[:3000]}

摘要："""
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ],
                        "stream": False
                    }
                )
                response.raise_for_status()
                result = response.json()
            
            summary = result.get("message", {}).get("content", "").strip()
            return summary[:max_length]
            
        except Exception as e:
            logger.error(f"摘要提取错误: {e}")
            return content[:max_length] + "..."
    
    async def extract_keywords(self, content: str, count: int = 10) -> List[str]:
        """提取关键词"""
        prompt = f"""请从以下内容中提取{count}个最重要的关键词，用逗号分隔：

{content[:2000]}

关键词："""
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ],
                        "stream": False
                    }
                )
                response.raise_for_status()
                result = response.json()
            
            keywords_text = result.get("message", {}).get("content", "").strip()
            keywords = [k.strip() for k in keywords_text.split(",")]
            return keywords[:count]
            
        except Exception as e:
            logger.error(f"关键词提取错误: {e}")
            return []

