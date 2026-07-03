import edge_tts
from typing import AsyncGenerator

# Free neural voices from Microsoft Edge list:
# "en-US-AvaNeural" (Female, warm)
# "en-US-AndrewAndrewNeural" (Male, warm)
# "en-GB-SoniaNeural" (Female, British)
DEFAULT_VOICE = "en-US-AvaNeural"

# Simple cache to prevent redundant Microsoft Edge-TTS network calls
_tts_cache = {}

async def generate_speech_stream(text: str, voice: str = DEFAULT_VOICE) -> AsyncGenerator[bytes, None]:
    """
    Generates neural text-to-speech audio using edge-tts and yields chunks of MP3 data.
    Does not require any subscription keys or payment.
    """
    communicate = edge_tts.Communicate(text, voice)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]

async def generate_speech_bytes(text: str, voice: str = DEFAULT_VOICE) -> bytes:
    """
    Generates neural text-to-speech audio and returns a single bytes buffer of the MP3.
    """
    cache_key = (text, voice)
    if cache_key in _tts_cache:
        return _tts_cache[cache_key]

    communicate = edge_tts.Communicate(text, voice)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
            
    # Bounded cache to avoid memory leaks
    if len(_tts_cache) > 200:
        _tts_cache.clear()
    _tts_cache[cache_key] = audio_data
    return audio_data
