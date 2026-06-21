import edge_tts
from typing import AsyncGenerator

# Free neural voices from Microsoft Edge list:
# "en-US-AvaNeural" (Female, warm)
# "en-US-AndrewNeural" (Male, warm)
# "en-GB-SoniaNeural" (Female, British)
DEFAULT_VOICE = "en-US-AvaNeural"

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
    communicate = edge_tts.Communicate(text, voice)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data
