# 语音功能使用指南

## 功能概述

本项目支持完整的语音交互功能：
- **语音转文字（STT）**: 将用户语音转换为文字
- **文字转语音（TTS）**: 将智能体响应转换为语音
- **语音聊天**: 完整的语音对话流程

## 安装依赖

确保已安装语音处理相关依赖：

```bash
pip install openai-whisper gtts pyttsx3 pydub
```

## 语音转文字（STT）

### 使用Whisper（推荐，本地运行）

Whisper是OpenAI开源的语音识别模型，支持本地运行：

```bash
# 安装Whisper
pip install openai-whisper

# Whisper会自动下载模型（首次使用时）
```

### API端点

**POST** `/speech/transcribe`

接收音频文件，返回转录的文字。

**请求示例（curl）:**
```bash
curl -X POST "http://localhost:8000/speech/transcribe" \
  -F "audio=@your_audio.wav"
```

**响应:**
```json
{
  "text": "转录的文字内容",
  "format": "wav"
}
```

**支持的音频格式:**
- WAV
- MP3
- M4A
- 其他常见音频格式

## 文字转语音（TTS）

### 使用gTTS（需要网络，质量好）

gTTS使用Google的TTS服务，需要网络连接，但质量较好：

```bash
pip install gtts
```

### 使用pyttsx3（完全本地）

pyttsx3使用系统自带的TTS引擎，完全本地运行：

```bash
pip install pyttsx3
```

**注意**: Windows系统通常自带TTS引擎，Linux需要安装espeak或festival。

### API端点

**POST** `/speech/synthesize`

接收文字，返回音频文件。

**请求示例（curl）:**
```bash
curl -X POST "http://localhost:8000/speech/synthesize" \
  -F "text=你好，这是测试" \
  -F "language=zh" \
  --output response.wav
```

**参数:**
- `text`: 要转换的文字（必需）
- `language`: 语言代码（可选，默认: zh）

**响应:**
返回WAV格式的音频文件。

## 语音聊天

### API端点

**POST** `/chat/voice`

完整的语音对话接口：接收语音输入，返回语音或文字响应。

**请求示例（curl）:**
```bash
# 返回语音响应
curl -X POST "http://localhost:8000/chat/voice" \
  -F "audio=@your_audio.wav" \
  -F "agent_type=simple" \
  -F "return_audio=true" \
  --output response.wav

# 返回文字响应
curl -X POST "http://localhost:8000/chat/voice" \
  -F "audio=@your_audio.wav" \
  -F "agent_type=simple" \
  -F "return_audio=false"
```

**参数:**
- `audio`: 音频文件（必需）
- `agent_type`: 智能体类型（可选，默认: simple）
- `conversation_id`: 对话ID（可选）
- `return_audio`: 是否返回音频（可选，默认: true）

**响应（return_audio=true）:**
返回WAV格式的音频文件，响应头包含：
- `X-Transcribed-Text`: 转录的用户输入
- `X-Response-Text`: 智能体的文字响应

**响应（return_audio=false）:**
```json
{
  "transcribed_text": "用户说的话",
  "response_text": "智能体的回复",
  "agent_type": "simple",
  "conversation_id": null
}
```

## 前端集成示例

### JavaScript/TypeScript

```javascript
// 录音并发送
async function sendVoiceMessage() {
  const audioBlob = await recordAudio(); // 你的录音函数
  
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');
  formData.append('agent_type', 'simple');
  formData.append('return_audio', 'true');
  
  const response = await fetch('http://localhost:8000/chat/voice', {
    method: 'POST',
    body: formData
  });
  
  // 获取转录的文字
  const transcribedText = response.headers.get('X-Transcribed-Text');
  const responseText = response.headers.get('X-Response-Text');
  
  // 获取音频响应
  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  
  // 播放音频
  const audio = new Audio(audioUrl);
  audio.play();
}
```

### Python客户端示例

```python
import requests

# 发送语音消息
with open('recording.wav', 'rb') as f:
    files = {'audio': f}
    data = {
        'agent_type': 'simple',
        'return_audio': 'true'
    }
    
    response = requests.post(
        'http://localhost:8000/chat/voice',
        files=files,
        data=data
    )
    
    # 获取响应
    transcribed_text = response.headers.get('X-Transcribed-Text')
    response_text = response.headers.get('X-Response-Text')
    
    # 保存音频响应
    with open('response.wav', 'wb') as out:
        out.write(response.content)
```

## 配置说明

在 `.env` 文件中可以配置：

```env
# Ollama语音模型（如果Ollama支持）
OLLAMA_STT_MODEL=whisper
OLLAMA_TTS_MODEL=tts
```

## 注意事项

1. **Whisper模型**: 首次使用会自动下载模型（约500MB-3GB，取决于选择的模型大小）
2. **gTTS网络要求**: 使用gTTS需要网络连接
3. **pyttsx3系统要求**: Linux系统需要安装TTS引擎（espeak或festival）
4. **音频格式**: 推荐使用WAV格式，质量最好
5. **性能**: 语音处理可能需要几秒到几十秒，取决于音频长度和模型大小

## 故障排除

### Whisper安装问题

如果遇到Whisper安装问题：

```bash
# 确保有足够的磁盘空间（至少3GB）
# 确保Python版本 >= 3.8
python --version

# 如果仍有问题，尝试：
pip install --upgrade pip
pip install openai-whisper
```

### TTS引擎问题

**Linux系统:**
```bash
# 安装espeak
sudo apt-get install espeak

# 或安装festival
sudo apt-get install festival
```

**Windows系统:**
通常自带TTS引擎，无需额外安装。

### 音频格式问题

如果遇到音频格式不支持，可以使用pydub转换：

```python
from pydub import AudioSegment

# 转换为WAV
audio = AudioSegment.from_mp3("input.mp3")
audio.export("output.wav", format="wav")
```

