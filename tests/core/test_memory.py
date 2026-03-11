
import unittest
import asyncio
from unittest.mock import MagicMock, patch, mock_open
from core.memory.manager import MemoryManager, ShortTermMemory, EpisodicMemory, LongTermMemory, MemoryItem

class TestMemoryManager(unittest.TestCase):
    def setUp(self):
        self.manager = MemoryManager()
        # Mock file operations for episodic and long term memory
        self.mock_file_ops = patch('builtins.open', mock_open())
        self.mock_file_ops.start()
        
        # Patch json.dump to avoid actual writing
        self.mock_json_dump = patch('json.dump')
        self.mock_json_dump.start()

    def tearDown(self):
        self.mock_file_ops.stop()
        self.mock_json_dump.stop()

    def test_short_term_memory(self):
        async def run_test():
            stm = ShortTermMemory(max_turns=3)
            await stm.add(MemoryItem(content="1"))
            await stm.add(MemoryItem(content="2"))
            await stm.add(MemoryItem(content="3"))
            
            items = await stm.get()
            self.assertEqual(len(items), 3)
            self.assertEqual(items[0].content, "1")
            
            # FIFO check
            await stm.add(MemoryItem(content="4"))
            items = await stm.get()
            self.assertEqual(len(items), 3)
            self.assertEqual(items[0].content, "2")
            self.assertEqual(items[2].content, "4")

        asyncio.run(run_test())

    def test_episodic_memory(self):
        async def run_test():
            # Mock loading
            with patch('json.load', return_value=[]):
                em = EpisodicMemory(storage_path="dummy.json")
            
            await em.add(MemoryItem(content="Event 1"))
            self.assertEqual(len(em.episodes), 1)
            self.assertEqual(em.episodes[0].content, "Event 1")
            
            # Test search
            await em.add(MemoryItem(content="Another event"))
            results = await em.search("Event")
            self.assertEqual(len(results), 2)
            
            results = await em.search("Another")
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].content, "Another event")

        asyncio.run(run_test())

    def test_memory_manager_integration(self):
        async def run_test():
            # Test remember
            await self.manager.remember("Remember this", memory_type="short_term")
            items = await self.manager.recall(memory_type="short_term")
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0].content, "Remember this")
            
            # Test context generation
            context = await self.manager.get_context_for_agent("Remember")
            self.assertIn("Remember this", context)
            self.assertIn("=== Agent Memory Context ===", context)

        asyncio.run(run_test())

if __name__ == "__main__":
    unittest.main()
