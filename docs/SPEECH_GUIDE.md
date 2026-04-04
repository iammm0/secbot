# 语音功能使用指南

## 功能概述

本项目计划支持完整的语音交互功能：
- **语音转文字（STT）**: 将用户语音转换为文字
- **文字转语音（TTS）**: 将智能体响应转换为语音
- **语音聊天**: 完整的语音对话流程

> **注意**：语音功能目前为 TypeScript 版本的**计划功能**，尚未完全实现。以下文档描述的是目标 API 设计与配置方式，供未来开发参考。

## 配置方式

在 `.env` 文件中配置语音输入（STT）与输出（TTS）：

```env
# 语音输入：引擎选择
STT_ENGINE=fast_whisper
STT_MODEL=base
STT_DEVICE=cpu
STT_COMPUTE_TYPE=int8
STT_VAD_FILTER=true

# 语音输出
TTS_ENGINE=gtts
```

## 计划支持的 STT 引擎

### Faster-Whisper（推荐）

基于 CTranslate2，速度快、占用低。

- **STT_MODEL**：可选 `tiny`/`base`/`small`/`medium`/`large-v2`/`large-v3`/`turbo`/`distil-large-v3`
- **STT_DEVICE**：`cpu` 或 `cuda`
- **STT_COMPUTE_TYPE**：CPU 推荐 `int8`/`float32`，GPU 推荐 `float16`

### Whisper（openai-whisper）

OpenAI 开源的语音识别模型，支持本地运行。模型名为 `tiny`/`base`/`small`/`medium`/`large`。

## 计划支持的 API 端点

### 语音转文字

**POST** `/speech/transcribe`

接收音频文件，返回转录的文字。

```bash
curl -X POST "http://localhost:8000/speech/transcribe" \
  -F "audio=@your_audio.wav"
```

响应：

```json
{
  "text": "转录的文字内容",
  "format": "wav"
}
```

支持的音频格式：WAV、MP3、M4A 等常见格式。

### 文字转语音

**POST** `/speech/synthesize`

接收文字，返回音频文件。

```bash
curl -X POST "http://localhost:8000/speech/synthesize" \
  -F "text=你好，这是测试" \
  -F "language=zh" \
  --output response.wav
```

### 语音聊天

**POST** `/chat/voice`

完整的语音对话接口：接收语音输入，返回语音或文字响应。

```bash
# 返回语音响应
curl -X POST "http://localhost:8000/chat/voice" \
  -F "audio=@your_audio.wav" \
  -F "agent_type=secbot-cli" \
  -F "return_audio=true" \
  --output response.wav

# 返回文字响应
curl -X POST "http://localhost:8000/chat/voice" \
  -F "audio=@your_audio.wav" \
  -F "agent_type=secbot-cli" \
  -F "return_audio=false"
```

参数：

- `audio`: 音频文件（必需）
- `agent_type`: 智能体类型（可选，默认 `secbot-cli`）
- `conversation_id`: 对话ID（可选）
- `return_audio`: 是否返回音频（可选，默认 `true`）

## 前端集成示例

### JavaScript/TypeScript

```typescript
async function sendVoiceMessage() {
  const audioBlob = await recordAudio();

  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');
  formData.append('agent_type', 'secbot-cli');
  formData.append('return_audio', 'true');

  const response = await fetch('http://localhost:8000/chat/voice', {
    method: 'POST',
    body: formData,
  });

  const transcribedText = response.headers.get('X-Transcribed-Text');
  const responseText = response.headers.get('X-Response-Text');

  const blob = await response.blob();
  const audioUrl = URL.createObjectURL(blob);

  const audio = new Audio(audioUrl);
  audio.play();
}
```

## 注意事项

1. **计划功能**：语音模块正在 TypeScript 版本中开发，当前版本可能尚未包含完整实现
2. **Whisper 模型**：首次使用会自动下载模型（约 500MB-3GB）
3. **gTTS 网络要求**：使用 gTTS 需要网络连接
4. **音频格式**：推荐使用 WAV 格式，质量最好
5. **性能**：语音处理可能需要几秒到几十秒，取决于音频长度和模型大小

## 故障排除

### TTS 引擎问题

**Linux 系统：**

```bash
# 安装 espeak
sudo apt-get install espeak

# 或安装 festival
sudo apt-get install festival
```

**Windows 系统：**
通常自带 TTS 引擎，无需额外安装。

### 音频格式问题

如果遇到音频格式不支持的问题，可在前端进行格式转换后再上传。
