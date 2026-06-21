import io
import re
import wave
import logging
import numpy as np
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("stellora.speech")

class SimpleVAD:
    """
    Dynamic energy-based Voice Activity Detection (VAD) for 16kHz 16-bit mono PCM.
    Tracks background noise floor and identifies speech endpoints.
    """
    def __init__(
        self, 
        sample_rate: int = 16000, 
        threshold_rms: float = 350.0, 
        silence_limit_ms: int = 1000
    ):
        self.sample_rate = sample_rate
        self.threshold_rms = threshold_rms
        self.silence_limit_ms = silence_limit_ms
        self.speech_buffer = bytearray()
        self.is_speaking = False
        self.silence_accum_ms = 0.0
        self.noise_floor = 100.0

    def process_chunk(self, chunk: bytes) -> Tuple[bool, bool, Optional[bytes]]:
        """
        Processes a raw PCM chunk.
        Returns:
            is_speaking (bool): Currently capturing speech
            endpoint_detected (bool): Silence duration reached, speech segment complete
            speech_segment (Optional[bytes]): The accumulated PCM speech segment if endpoint detected
        """
        samples = np.frombuffer(chunk, dtype=np.int16)
        if len(samples) == 0:
            return self.is_speaking, False, None

        # Calculate Root-Mean-Square (RMS) energy
        rms = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))

        # Update noise floor slowly during silence
        if rms < self.noise_floor:
            self.noise_floor = 0.95 * self.noise_floor + 0.05 * rms
        elif rms < self.noise_floor * 1.5:
            self.noise_floor = 0.99 * self.noise_floor + 0.01 * rms

        # Dynamic threshold calculation
        threshold = max(self.threshold_rms, self.noise_floor * 2.5)
        chunk_duration_ms = (len(samples) / self.sample_rate) * 1000.0

        if rms > threshold:
            # Speech signal active
            if not self.is_speaking:
                self.is_speaking = True
            self.silence_accum_ms = 0.0
            self.speech_buffer.extend(chunk)
            return True, False, None
        else:
            # Silence / noise floor active
            if self.is_speaking:
                self.speech_buffer.extend(chunk)
                self.silence_accum_ms += chunk_duration_ms
                if self.silence_accum_ms >= self.silence_limit_ms:
                    # Silence threshold exceeded -> Speech Endpoint detected
                    speech_segment = bytes(self.speech_buffer)
                    self.speech_buffer.clear()
                    self.is_speaking = False
                    self.silence_accum_ms = 0.0
                    return False, True, speech_segment
                return True, False, None
            else:
                # Discard silent frames before speech starts to keep buffer clean
                return False, False, None

def pcm_to_wav(pcm_data: bytes, sample_rate: int = 16000) -> bytes:
    """Wraps raw mono PCM bytes into a standard WAV format container."""
    wav_buf = io.BytesIO()
    with wave.open(wav_buf, "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)
    return wav_buf.getvalue()

async def run_speech_pipeline(
    audio_wav: bytes,
    gemini_client: Any,
    target_lang: str,
    mode: str = "general",
    vocabulary: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Sends WAV audio bytes to Gemini to perform simultaneous ASR, Translation, 
    Biasing, and Rewrite enhancement.
    """
    if not gemini_client:
        return {
            "detected_language": "Unknown",
            "transcript": "Gemini client not initialized.",
            "translation": "Gemini client not initialized.",
            "confidence": 0.0
        }

    vocab_str = ", ".join(vocabulary) if vocabulary else "None"
    
    prompt = f"""You are a state-of-the-art AI dictation and translation assistant.
Analyze the audio input and perform the following operations:
1. SPEECH-TO-TEXT (ASR): Transcribe the spoken audio into the original language spoken. Keep it accurate.
2. TRANSLATION: Translate the transcript into the target language code: "{target_lang}".
3. CUSTOM VOCABULARY: Bias the speech-to-text and translation using these custom vocabulary terms: {vocab_str}. If a phonetically similar sound is heard, align it to these terms.
4. TEXT ENHANCEMENT MODE: Format the transcribed text according to the selected mode: "{mode}".
   - "general": Correct grammar and restore punctuation. Remove filler words (like "um", "like", "ah"). Keep the semantic meaning exactly.
   - "email": Rewrite as a professional, well-structured email with clear paragraphs.
   - "code": Rewrite into clean, formatted code blocks if code/syntax was spoken.
   - "meeting": Summarize as action-oriented meeting minutes with bullet points.
   - "academic": Structure as formal academic prose with elevated vocabulary.

Return ONLY a valid JSON object. Do not include markdown fences or any surrounding text. The JSON keys must be:
- "detected_language": the language detected in the audio (e.g., "English", "Japanese", "Spanish")
- "transcript": the final formatted/enhanced transcript in the original language
- "translation": the translation of the formatted transcript in the target language
- "confidence": float value between 0.0 and 1.0 representing transcription confidence
"""
    try:
        from google.genai import types
        # List of models to try in sequence in case of rate limits or service unavailability
        models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]
        response = None
        last_exc = None
        
        for model_name in models_to_try:
            try:
                logger.info(f"Invoking speech pipeline using model: {model_name}")
                response = await run_in_threadpool_or_async(
                    gemini_client,
                    audio_wav,
                    prompt,
                    model_name
                )
                if response:
                    break
            except Exception as e:
                logger.warning(f"Model {model_name} invocation failed: {str(e)}")
                last_exc = e
                
        if response is None:
            raise last_exc or RuntimeError("All fallback models failed to respond.")
        
        response_text = response.text.strip()
        # Strip potential markdown code blocks
        if response_text.startswith("```"):
            response_text = re.sub(r"^```(?:json)?\n", "", response_text)
            response_text = re.sub(r"\n```$", "", response_text)
            response_text = response_text.strip()
            
        import json
        result = json.loads(response_text)
        return result
    except Exception as exc:
        logger.exception("Error running speech pipeline via Gemini")
        return {
            "detected_language": "Error",
            "transcript": f"Transcription error: {str(exc)}",
            "translation": f"Translation error: {str(exc)}",
            "confidence": 0.0
        }

async def run_in_threadpool_or_async(client: Any, audio_wav: bytes, prompt: str, model_name: str) -> Any:
    """Helper to run the blocking Gemini model generate call."""
    from google.genai import types
    import asyncio
    
    def call():
        return client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(data=audio_wav, mime_type="audio/wav"),
                prompt
            ]
        )
    
    return await asyncio.get_event_loop().run_in_executor(None, call)
