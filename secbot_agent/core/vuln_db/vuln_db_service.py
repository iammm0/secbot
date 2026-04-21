"""
漏洞库统一服务
整合多数据源适配器 + 向量检索，提供：
- 按扫描结果自动匹配漏洞
- 按 CVE ID 精确查询
- 自然语言语义搜索
- 多源同步
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

from loguru import logger

from secbot_agent.core.vuln_db.schema import UnifiedVuln, ScanVulnMapping
from secbot_agent.core.vuln_db.vuln_vector_store import VulnVectorStore
from secbot_agent.core.vuln_db.adapters.base_adapter import BaseVulnAdapter
from secbot_agent.core.vuln_db.adapters.cve_adapter import CveAdapter
from secbot_agent.core.vuln_db.adapters.nvd_adapter import NvdAdapter
from secbot_agent.core.vuln_db.adapters.exploit_db_adapter import ExploitDBAdapter
from secbot_agent.core.vuln_db.adapters.mitre_adapter import MitreAttackAdapter

_CVE_PATTERN = re.compile(r"CVE-\d{4}-\d{4,}", re.IGNORECASE)


class VulnDBService:
    """漏洞库统一服务"""

    def __init__(
        self,
        db_path: str = "./data/vuln_vectors.db",
        dimension: int = 768,
        nvd_api_key: Optional[str] = None,
    ):
        self._vector_store = VulnVectorStore(db_path=db_path, dimension=dimension)
        self._dimension = dimension

        self._adapters: Dict[str, BaseVulnAdapter] = {
            "cve": CveAdapter(),
            "nvd": NvdAdapter(api_key=nvd_api_key),
            "exploit_db": ExploitDBAdapter(),
            "mitre_attack": MitreAttackAdapter(),
        }

        self._embedder = None  # 延迟初始化

    # ------------------------------------------------------------------
    # Embedding 工具
    # ------------------------------------------------------------------

    async def _get_embedder(self):
        if self._embedder is None:
            from utils.embeddings import OllamaEmbeddings
            self._embedder = OllamaEmbeddings()
        return self._embedder

    async def _embed_texts(self, texts: List[str]) -> List[List[float]]:
        embedder = await self._get_embedder()
        try:
            return await embedder.embed_documents(texts)
        except Exception as exc:
            logger.warning(f"Embedding 失败，回退为空向量: {exc}")
            return [[0.0] * self._dimension for _ in texts]

    async def _embed_query(self, text: str) -> List[float]:
        embedder = await self._get_embedder()
        try:
            vecs = await embedder.embed_documents([text])
            return vecs[0]
        except Exception as exc:
            logger.warning(f"Embedding 查询失败: {exc}")
            return [0.0] * self._dimension

    # ------------------------------------------------------------------
    # 核心查询接口
    # ------------------------------------------------------------------

    async def search_by_cve_id(self, cve_id: str) -> Optional[UnifiedVuln]:
        """精确查询 CVE"""
        for name in ("nvd", "cve"):
            adapter = self._adapters.get(name)
            if adapter:
                result = await adapter.fetch_by_id(cve_id)
                if result:
                    await self._index_vulns([result])
                    return result
        return None

    async def search_by_scan_result(
        self,
        scan_result: Dict,
        limit: int = 5,
    ) -> ScanVulnMapping:
        """
        根据扫描器输出的单条漏洞结果，
        通过向量检索 + 关键词在线搜索匹配漏洞库条目。
        """
        vuln_type = scan_result.get("type", "")
        description = scan_result.get("description", "")
        severity = scan_result.get("severity", "")

        query_text = f"{vuln_type} {description} {severity}"

        # 1) 向量检索（如果库中已有数据）
        matched: List[UnifiedVuln] = []
        best_score = 0.0

        if self._vector_store.count() > 0:
            query_vec = await self._embed_query(query_text)
            vec_results = self._vector_store.search_similar(
                query_vec, limit=limit, threshold=0.4
            )
            for meta, score in vec_results:
                vuln_id = meta.get("vuln_id", "")
                if vuln_id:
                    vuln = await self.search_by_cve_id(vuln_id) if vuln_id.startswith("CVE") else None
                    if vuln:
                        matched.append(vuln)
                        best_score = max(best_score, score)

        # 2) 提取描述中的 CVE ID 直接查询
        cve_ids = _CVE_PATTERN.findall(description) + _CVE_PATTERN.findall(vuln_type)
        for cid in cve_ids[:3]:
            vuln = await self.search_by_cve_id(cid.upper())
            if vuln and vuln.vuln_id not in {m.vuln_id for m in matched}:
                matched.append(vuln)
                best_score = max(best_score, 0.95)

        # 3) 在线关键词搜索补充
        if len(matched) < limit:
            remaining = limit - len(matched)
            online = await self._online_keyword_search(vuln_type, remaining)
            seen = {m.vuln_id for m in matched}
            for v in online:
                if v.vuln_id not in seen:
                    matched.append(v)
                    seen.add(v.vuln_id)

        return ScanVulnMapping(
            scan_vuln_type=vuln_type,
            scan_description=description,
            matched_vulns=matched[:limit],
            match_score=best_score,
        )

    async def search_natural_language(
        self, query: str, limit: int = 10
    ) -> List[UnifiedVuln]:
        """自然语言语义检索"""
        results: List[UnifiedVuln] = []
        seen: set = set()

        # 向量检索
        if self._vector_store.count() > 0:
            query_vec = await self._embed_query(query)
            vec_results = self._vector_store.search_similar(
                query_vec, limit=limit, threshold=0.4
            )
            for meta, _ in vec_results:
                vid = meta.get("vuln_id", "")
                if vid and vid not in seen:
                    vuln = await self.search_by_cve_id(vid) if vid.startswith("CVE") else None
                    if vuln:
                        results.append(vuln)
                        seen.add(vid)

        # 在线补充
        if len(results) < limit:
            cve_ids = _CVE_PATTERN.findall(query)
            for cid in cve_ids[:3]:
                vuln = await self.search_by_cve_id(cid.upper())
                if vuln and vuln.vuln_id not in seen:
                    results.append(vuln)
                    seen.add(vuln.vuln_id)

        if len(results) < limit:
            online = await self._online_keyword_search(query, limit - len(results))
            for v in online:
                if v.vuln_id not in seen:
                    results.append(v)
                    seen.add(v.vuln_id)

        return results[:limit]

    # ------------------------------------------------------------------
    # 数据同步
    # ------------------------------------------------------------------

    async def sync_from_sources(
        self,
        keywords: List[str],
        sources: Optional[List[str]] = None,
        limit_per_source: int = 50,
    ) -> int:
        """
        从多数据源按关键词同步漏洞数据到本地向量库。
        返回新增条目数。
        """
        target_sources = sources or ["nvd", "cve"]
        all_vulns: List[UnifiedVuln] = []
        seen: set = set()

        for src in target_sources:
            adapter = self._adapters.get(src)
            if not adapter:
                continue
            for kw in keywords:
                try:
                    vulns = await adapter.search(kw, limit=limit_per_source)
                    for v in vulns:
                        if v.vuln_id not in seen:
                            all_vulns.append(v)
                            seen.add(v.vuln_id)
                except Exception as exc:
                    logger.warning(f"同步 {src}/{kw} 失败: {exc}")

        if all_vulns:
            count = await self._index_vulns(all_vulns)
            logger.info(f"同步完成: 共 {count} 条漏洞入库")
            return count
        return 0

    # ------------------------------------------------------------------
    # 内部方法
    # ------------------------------------------------------------------

    async def _index_vulns(self, vulns: List[UnifiedVuln]) -> int:
        """将漏洞 embedding 后写入向量库"""
        if not vulns:
            return 0

        texts = [v.build_embedding_text() for v in vulns]
        embeddings = await self._embed_texts(texts)
        return self._vector_store.upsert_vulns(vulns, embeddings)

    async def _online_keyword_search(
        self, keyword: str, limit: int
    ) -> List[UnifiedVuln]:
        results: List[UnifiedVuln] = []
        seen: set = set()

        for src_name in ("nvd", "cve"):
            adapter = self._adapters.get(src_name)
            if not adapter:
                continue
            try:
                vulns = await adapter.search(keyword, limit=limit)
                for v in vulns:
                    if v.vuln_id not in seen:
                        results.append(v)
                        seen.add(v.vuln_id)
            except Exception as exc:
                logger.debug(f"在线搜索 {src_name} 失败: {exc}")
            if len(results) >= limit:
                break

        if results:
            await self._index_vulns(results)

        return results[:limit]

    # ------------------------------------------------------------------
    # 生命周期
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict:
        return {
            "vector_count": self._vector_store.count(),
            "adapters": list(self._adapters.keys()),
        }

    def close(self):
        self._vector_store.close()
