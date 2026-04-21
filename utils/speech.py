"""
语音处理模块：语音转文字（STT）和文字转语音（TTS）
STT 支持：openai-whisper（whisper）、faster-whisper（fast_whisper，推荐）
"""
import os
import tempfile
from typing import Optional

from hackbot_config import settings
from utils.logger import logger


class SpeechToText:
    """语音转文字（支持 Whisper / Faster-Whisper）"""

    def __init__(
        self,
        engine: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        device: Optional[str] = None,
        compute_type: Optional[str] = None,
        vad_filter: Optional[bool] = None,
    ):
        self.base_url = base_url or getattr(settings, "ollama_base_url", "http://localhost:11434")
        self.engine = (engine or getattr(settings, "stt_engine", "fast_whisper")).strip().lower()
        self.model = model or settings.stt_model
        self.device = device or getattr(settings, "stt_device", "cpu")
        self.compute_type = compute_type or getattr(settings, "stt_compute_type", "int8")
        self.vad_filter = vad_filter if vad_filter is not None else getattr(settings, "stt_vad_filter", True)
        self._fast_whisper_model = None  # 缓存 faster-whisper 模型

    async def transcribe(self, audio_data: bytes, audio_format: str = "wav") -> str:
        """
        将音频转换为文字。

        Args:
            audio_data: 音频文件的二进制数据
            audio_format: 音频格式 (wav, mp3, etc.)

        Returns:
            转录的文字
        """
        if self.engine == "fast_whisper":
            return await self._transcribe_with_fast_whisper(audio_data, audio_format)
        return await self._transcribe_with_whisper(audio_data)

    async def _transcribe_with_fast_whisper(self, audio_data: bytes, audio_format: str = "wav") -> str:
        """使用 faster-whisper 进行语音识别（推荐：更快、更省显存）"""
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise ImportError("使用 fast_whisper 需安装: pip install faster-whisper")

        import asyncio

        def _run():
            nonlocal self
            if self._fast_whisper_model is None:
                self._fast_whisper_model = WhisperModel(
                    self.model,
                    device=self.device,
                    compute_type=self.compute_type,
                )
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{audio_format}") as tmp_file:
                tmp_file.write(audio_data)
                tmp_path = tmp_file.name
            try:
                segments, info = self._fast_whisper_model.transcribe(
                    tmp_path,
                    vad_filter=self.vad_filter,
                )
                text = " ".join(s.text for s in segments).strip()
                logger.info(f"Faster-Whisper 转录完成 (语言: {getattr(info, 'language', '?')}): {text[:50]}")
                return text
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _run)

    async def _transcribe_with_whisper(self, audio_data: bytes) -> str:
        """使用 openai-whisper 进行语音识别（本地）"""
        try:
            import whisper
        except ImportError:
            raise ImportError("使用 whisper 引擎需安装: pip install openai-whisper")

        import asyncio

        def _run():
            model = whisper.load_model(self.model)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
                tmp_file.write(audio_data)
                tmp_path = tmp_file.name
            try:
                result = model.transcribe(tmp_path)
                return result["text"].strip()
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, _run)
        logger.info(f"Whisper 转录完成: {text[:50]}")
        return text


class TextToSpeech:
    """文字转语音（使用gTTS或pyttsx3）"""

    def __init__(self, engine: str = None, base_url: str = None):
        self.base_url = base_url or settings.ollama_base_url
        self.engine = engine or settings.tts_engine

    async def synthesize(self, text: str, language: str = "zh") -> bytes:
        """
        将文字转换为语音

        Args:
            text: 要转换的文字
            language: 语言代码 (zh, en, etc.)

        Returns:
            音频文件的二进制数据 (WAV格式)
        """
        # 根据配置的引擎选择TTS方法
        if self.engine == "gtts":
            return await self._synthesize_with_gtts(text, language)
        elif self.engine == "pyttsx3":
            return await self._synthesize_with_pyttsx3(text)
        else:
            # 默认使用gTTS
            logger.warning(f"未知的TTS引擎: {self.engine}，使用gTTS")
            return await self._synthesize_with_gtts(text, language)

    async def _synthesize_with_gtts(self, text: str, language: str = "zh") -> bytes:
        """使用gTTS（Google TTS，需要网络）"""
        try:
            from gtts import gTTS
            import tempfile
            import os

            tts = gTTS(text=text, lang=language, slow=False)

            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_file:
                tmp_path = tmp_file.name
                tts.save(tmp_path)

            try:
                # 读取音频文件
                with open(tmp_path, "rb") as f:
                    audio_data = f.read()
                return audio_data
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        except ImportError:
            raise ImportError("需要安装gTTS: pip install gtts")
        except Exception as e:
            logger.error(f"gTTS合成错误: {e}")
            raise

    async def _synthesize_with_pyttsx3(self, text: str) -> bytes:
        """使用pyttsx3（完全本地TTS）"""
        try:
            import pyttsx3
            import tempfile
            import os

            engine = pyttsx3.init()

            # 设置语音属性
            voices = engine.getProperty('voices')
            if voices:
                # 尝试找到中文语音
                for voice in voices:
                    if 'chinese' in voice.name.lower() or 'zh' in voice.id.lower():
                        engine.setProperty('voice', voice.id)
                        break

            # 保存到临时文件
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
                tmp_path = tmp_file.name
                engine.save_to_file(text, tmp_path)
                engine.runAndWait()

            try:
                with open(tmp_path, "rb") as f:
                    audio_data = f.read()
                return audio_data
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        except ImportError:
            raise ImportError("需要安装TTS库: pip install pyttsx3 或 pip install gtts")
        except Exception as e:
            logger.error(f"pyttsx3 TTS错误: {e}")
            raise

