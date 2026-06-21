import os
import json
import logging
import httpx
import asyncio
from typing import List, Dict, Any, Tuple
from pydantic import BaseModel, Field
from app.services.ora_db import ora_db

logger = logging.getLogger("stellora.ora_ai")

class OraResponse(BaseModel):
    corrected_query: str = Field(
        description="The traveler's input message, corrected for any speech-to-text typos, accent mispronunciations, or spelling mistakes based on travel context (e.g. correct 'yoen' to 'Ueno' or 'Yoyogi', 'stellar or' to 'Stellora', 'bengaluru' to 'Bengaluru'). If there are no typos, keep it exactly as the original user query."
    )
    reply: str = Field(
        description="Your warm, concise, and helpful response to the user."
    )

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def get_gemini_keys() -> List[str]:
    """Dynamically loads and returns all available Gemini API keys from environment."""
    keys = []
    primary = os.getenv("GEMINI_API_KEY")
    if primary:
        keys.append(primary)
    
    idx = 2
    while True:
        key = os.getenv(f"GEMINI_API_KEY_{idx}")
        if key:
            keys.append(key)
            idx += 1
        else:
            break
    return keys

def get_groq_keys() -> List[str]:
    """Dynamically loads and returns all available Groq API keys from environment."""
    keys = []
    primary = os.getenv("GROQ_API_KEY")
    if primary:
        keys.append(primary)
    
    idx = 2
    while True:
        key = os.getenv(f"GROQ_API_KEY_{idx}")
        if key:
            keys.append(key)
            idx += 1
        else:
            break
    return keys

CRISIS_KEYWORDS = [
    "suicide", "suicidal", "kill myself", "end my life", "want to die",
    "self harm", "harm myself", "hurt myself", "cut myself", "depressed and want to end it"
]

CRISIS_RESPONSE = (
    "If you are feeling overwhelmed, hopeless, or having thoughts of self-harm, please know that you are not alone. "
    "Please connect with someone who can support you, such as calling or texting 988 (in the US & Canada) to reach the Suicide & Crisis Lifeline, "
    "or contact your local emergency services immediately. Support is available, and you do not have to carry this alone."
)

SYSTEM_PROMPT_TEMPLATE = """You are ORA, the warm, concise, and helpful voice-first AI travel companion for the Stellora travel app.

Your directives:
1. Provide extremely concise, natural, conversational responses suitable for text-to-speech voice playback. Keep paragraphs short and avoid long lists unless explicitly asked.
2. Incorporate the traveler's context: their location, timezone, active trip info, or saved preferences when relevant.
3. Be warm and supportive, acting as a trusted companion.
4. IMPORTANT SAFETY DISCLOSURE: If asked for medical, mental health, or legal advice, immediately remind the user that you are an AI travel assistant, not a professional, and urge them to consult a qualified doctor, counselor, or legal expert. Do not diagnose or offer specific medical/legal advice.

Traveler Profile Memory:
{summarized_memory}

Traveler Preferences:
{preferences}

Current Location/Context:
{location_context}
"""

def check_safety_crisis(text: str) -> bool:
    """Returns True if the text contains crisis or self-harm indicators."""
    cleaned = text.lower()
    for word in CRISIS_KEYWORDS:
        if word in cleaned:
            return True
    return False

async def get_ai_reply(
    user_id: str,
    message: str,
    location_context: str = "Unknown location",
    history_limit: int = 15
) -> Tuple[str, str, bool]:
    """
    Core dialog handler.
    1. Runs safety checks on inputs.
    2. Builds LLM system instructions & history context.
    3. Requests Gemini with structured schema for auto-correction.
    4. Auto-falls back to Groq Llama 3.3 under rate limits/exceptions.
    5. Saves corrected user message and assistant reply to DB.
    """
    # 1. Safety Check
    if check_safety_crisis(message):
        logger.warning(f"Safety trigger matched for user: {user_id}")
        # Save both messages to history
        await ora_db.add_message(user_id, "user", message)
        await ora_db.add_message(user_id, "assistant", CRISIS_RESPONSE)
        return CRISIS_RESPONSE, message, True

    # 2. Build Context
    profile = await ora_db.get_user_profile(user_id)
    history = await ora_db.get_history(user_id, limit=history_limit)

    system_instruction = SYSTEM_PROMPT_TEMPLATE.format(
        summarized_memory=profile.get("summarized_memory", "None"),
        preferences=json.dumps(profile.get("preferences", {})),
        location_context=location_context
    )

    # Prepare message list for API call (exclude the current system prompt from messages array as it goes to system_instruction)
    api_messages = []
    # Feed last N messages (excluding the final user message which is already in history)
    for msg in history:
        api_messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    # Add current message
    api_messages.append({
        "role": "user",
        "content": message
    })

    reply_text = ""
    corrected_query = message
    
    # 3. Call Gemini (Primary with model & key rotation)
    gemini_keys = get_gemini_keys()
    for key in gemini_keys:
        gemini_models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-flash-latest"]
        for model in gemini_models:
            try:
                masked_key = key[:8] + "..." if len(key) > 8 else "..."
                logger.info(f"Attempting ORA response via Gemini model: {model} using key: {masked_key}")
                reply_text, corrected_query = await _call_gemini_with_model(api_messages, system_instruction, model, api_key=key)
                if reply_text:
                    logger.info(f"ORA response successfully generated using {model}")
                    break
            except Exception as e:
                logger.warning(f"Gemini model {model} failed with key {masked_key}: {e}. Trying next...")
        if reply_text:
            break
    
    # 4. Fallback to Groq (Llama-3.3-70b-versatile structured)
    if not reply_text:
        groq_keys = get_groq_keys()
        for g_key in groq_keys:
            try:
                masked_gkey = g_key[:8] + "..." if len(g_key) > 8 else "..."
                logger.info(f"Attempting ORA response via Groq Llama 3.3 (Structured) using key: {masked_gkey}")
                reply_text, corrected_query = await _call_groq(api_messages, system_instruction, api_key=g_key)
                if reply_text:
                    logger.info("ORA response successfully generated using Groq Llama 3.3")
                    break
            except Exception as e:
                logger.error(f"Groq fallback failed with key {masked_gkey}: {e}")
            
    # 5. Recovery if both fail
    if not reply_text:
        reply_text = (
            "I'm having a little trouble connecting to my brain right now, "
            "but I'm still here with you. Please try saying that again in a moment."
        )

    # Save corrected user message and assistant reply to DB
    await ora_db.add_message(user_id, "user", corrected_query)
    await ora_db.add_message(user_id, "assistant", reply_text)
    return reply_text, corrected_query, False

async def _call_gemini_with_model(messages: List[Dict[str, str]], system_instruction: str, model_name: str, api_key: str = None) -> Tuple[str, str]:
    """Helper calling the new Google GenAI SDK for specified Gemini model with structured JSON response."""
    from google.genai import types
    from google import genai
    
    key_to_use = api_key or os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=key_to_use)
    
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(
            role=role,
            parts=[types.Part.from_text(text=msg["content"])]
        ))
        
    def call():
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.7,
            max_output_tokens=2000,
            response_mime_type="application/json",
            response_schema=OraResponse
        )
        return client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config
        )
        
    response = await asyncio.get_event_loop().run_in_executor(None, call)
    
    reply_text = ""
    corrected_query = messages[-1]["content"] if messages else ""
    
    if response and response.text:
        try:
            data = json.loads(response.text.strip())
            reply_text = data.get("reply", "").strip()
            corrected_query = data.get("corrected_query", "").strip()
        except Exception as e:
            logger.warning(f"Structured ORA response parse failed for {model_name}: {e}. Raw response: {response.text}")
            reply_text = response.text.strip()
            
    return reply_text, corrected_query

async def _call_groq(messages: List[Dict[str, str]], system_instruction: str, api_key: str = None) -> Tuple[str, str]:
    """Helper calling Groq API using standard httpx client with structured JSON response."""
    key_to_use = api_key or os.getenv("GROQ_API_KEY")
    if not key_to_use:
        raise ValueError("No Groq API key configured.")

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key_to_use}",
        "Content-Type": "application/json"
    }
    
    structured_instruction = (
        f"{system_instruction}\n\n"
        "You must respond in JSON format matching this schema:\n"
        "{\n"
        "  \"corrected_query\": \"The traveler's input message, corrected for any speech-to-text typos or accent mispronunciations (e.g. 'yoen' to 'Ueno' or 'Yoyogi'). Keep it exactly as the original user query if there are no typos.\",\n"
        "  \"reply\": \"Your warm, concise, and helpful response to the user.\"\n"
        "}"
    )
    
    openai_messages = [{"role": "system", "content": structured_instruction}]
    for msg in messages:
        role = "assistant" if msg["role"] in ["assistant", "model"] else "user"
        openai_messages.append({"role": role, "content": msg["content"]})
        
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": openai_messages,
        "temperature": 0.7,
        "max_tokens": 500,
        "response_format": {"type": "json_object"}
    }
    
    async with httpx.AsyncClient(timeout=12) as client:
        res = await client.post(url, headers=headers, json=payload)
        
    if res.is_error:
        raise RuntimeError(f"Groq API Error {res.status_code}: {res.text}")
        
    data = res.json()
    raw_content = data["choices"][0]["message"]["content"].strip()
    
    reply_text = ""
    corrected_query = messages[-1]["content"] if messages else ""
    
    try:
        parsed = json.loads(raw_content)
        reply_text = parsed.get("reply", "").strip()
        corrected_query = parsed.get("corrected_query", "").strip()
    except Exception as e:
        logger.warning(f"Structured Groq response parse failed: {e}. Raw content: {raw_content}")
        reply_text = raw_content
        
    return reply_text, corrected_query

async def transcribe_groq_whisper(audio_bytes: bytes, filename: str = "audio.wav", mime_type: str = "audio/wav") -> str:
    """
    Transcribes audio using Groq Hosted Whisper model or falls back to Gemini 2.5 native transcription.
    """
    # 1. Try Groq Whisper with key rotation
    groq_keys = get_groq_keys()
    for g_key in groq_keys:
        try:
            masked_gkey = g_key[:8] + "..." if len(g_key) > 8 else "..."
            logger.info(f"Attempting transcription via Groq Whisper using key: {masked_gkey}...")
            url = "https://api.groq.com/openai/v1/audio/transcriptions"
            headers = {
                "Authorization": f"Bearer {g_key}"
            }
            files = {
                "file": (filename, audio_bytes, mime_type)
            }
            data = {
                "model": "whisper-large-v3",
                "response_format": "json",
                "temperature": 0.0
            }
            async with httpx.AsyncClient(timeout=25) as client:
                res = await client.post(url, headers=headers, files=files, data=data)
            if not res.is_error:
                return res.json().get("text", "")
            else:
                logger.warning(f"Groq Whisper transcription failed with key {masked_gkey}: {res.text}. Trying next key...")
        except Exception as e:
            logger.warning(f"Groq Whisper transcription failed with key {masked_gkey}: {e}. Trying next key...")

    # 2. Try Gemini 2.5 Flash native transcription (zero budget fallback) with model & key rotation
    gemini_keys = get_gemini_keys()
    for gem_key in gemini_keys:
        try:
            from google import genai
            from google.genai import types
            
            client = genai.Client(api_key=gem_key)
            
            # Map extension to mime type if standard audio/wav
            m_type = mime_type
            if filename:
                ext = filename.split(".")[-1].lower()
                if ext == "webm":
                    m_type = "audio/webm"
                elif ext == "mp3":
                    m_type = "audio/mp3"
                elif ext in ["m4a", "mp4"]:
                    m_type = "audio/mp4"
                elif ext == "ogg":
                    m_type = "audio/ogg"
            
            models_to_try = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-flash-latest"]
            response = None
            masked_key = gem_key[:8] + "..." if len(gem_key) > 8 else "..."
            
            for model_name in models_to_try:
                for attempt in range(3):
                    try:
                        logger.info(f"Attempting transcription via {model_name} (attempt {attempt+1}) using key: {masked_key}...")
                        def call():
                            config = types.GenerateContentConfig(
                                temperature=0.0
                            )
                            return client.models.generate_content(
                                model=model_name,
                                contents=[
                                    types.Part.from_bytes(data=audio_bytes, mime_type=m_type),
                                    "You are an expert audio transcriber. Provide a clean, verbatim transcription of this audio. Correct any phonetic spelling errors, accent-based mispronunciations, or speech-to-text typos (e.g., correct 'yoen' to 'Ueno' or 'Yoyogi', 'Stellora' instead of 'stellar or', 'Bengaluru' instead of 'bangalore'). Output only the corrected transcript text, with no introductory or concluding remarks. If there is no audible speech, reply with an empty string."
                                ],
                                config=config
                            )
                        response = await asyncio.get_event_loop().run_in_executor(None, call)
                        if response is not None and response.text is not None:
                            break # Success!
                    except Exception as e:
                        logger.warning(f"Transcription via {model_name} failed on attempt {attempt+1} with key {masked_key}: {e}")
                        await asyncio.sleep(1.0) # Wait 1s before retrying
                if response is not None and response.text is not None:
                    break
            
            if response is not None and response.text is not None:
                return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini transcription failed with key {masked_key}: {e}")

    raise ValueError("No active transcription provider (Groq/Gemini) succeeded or is configured.")

async def summarize_user_memory(user_id: str) -> bool:
    """
    Summarization background worker.
    Fuses previous memories and recent conversations into a compact summary,
    then prunes older messages from active display logs to keep context slim.
    """
    profile = await ora_db.get_user_profile(user_id)
    history = await ora_db.get_history(user_id, limit=35)
    
    if len(history) < 10:
        return False # No need to summarize small histories

    conv_log = ""
    for msg in history:
        conv_log += f"{msg['role'].upper()}: {msg['content']}\n"

    prompt = f"""You are ORA's background memory coordinator.
Analyze the following conversation history and the existing traveler profile summary.
Generate an updated, extremely concise (under 150 words) summary of key facts about the traveler (e.g. name, preferences, food limits, itinerary choices, or past corrections).
Do not repeat general greetings. Only focus on persistent, useful traveler attributes.

Existing Profile Memory:
{profile.get('summarized_memory', 'None')}

Recent Conversation Logs:
{conv_log}

Updated Profile Memory:
"""

    summary_text = ""
    
    # Try Gemini with model & key rotation
    gemini_keys = get_gemini_keys()
    for gem_key in gemini_keys:
        from google import genai
        client = genai.Client(api_key=gem_key)
        gemini_models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-flash-latest"]
        masked_key = gem_key[:8] + "..." if len(gem_key) > 8 else "..."
        for model in gemini_models:
            try:
                logger.info(f"Attempting ORA memory summary via Gemini model: {model} using key: {masked_key}")
                def call():
                    return client.models.generate_content(
                        model=model,
                        contents=prompt
                    )
                res = await asyncio.get_event_loop().run_in_executor(None, call)
                if res and res.text:
                    summary_text = res.text.strip()
                    logger.info(f"ORA memory summary successfully generated using {model}")
                    break
            except Exception as e:
                logger.warning(f"Gemini model {model} failed for memory summary with key {masked_key}: {e}. Trying next fallback...")
        if summary_text:
            break

    # Try Groq fallback with key rotation
    if not summary_text:
        groq_keys = get_groq_keys()
        for g_key in groq_keys:
            try:
                masked_gkey = g_key[:8] + "..." if len(g_key) > 8 else "..."
                logger.info(f"Attempting ORA memory summary via Groq Llama 3.3 using key: {masked_gkey}")
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {g_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 200
                }
                async with httpx.AsyncClient(timeout=12) as client:
                    res = await client.post(url, headers=headers, json=payload)
                if not res.is_error:
                    summary_text = res.json()["choices"][0]["message"]["content"].strip()
                    logger.info("ORA memory summary successfully generated using Groq Llama 3.3")
                    break
            except Exception as e:
                logger.warning(f"Groq memory summary failed with key {masked_gkey}: {e}")

    if summary_text:
        await ora_db.save_user_profile(user_id, summary_text, profile.get("preferences", {}))
        logger.info(f"ORA memory summary updated for user: {user_id}")
        return True
    return False
