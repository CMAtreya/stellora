import os
import json
import logging
import httpx
import asyncio
import math
from typing import List, Dict, Any, Tuple, Set, Optional
from pydantic import BaseModel, Field
from app.services.ora_db import ora_db

logger = logging.getLogger("stellora.ora_ai")

# Raw JSON schemas for Gemini strict structured outputs to prevent Pydantic additionalProperties errors
ORA_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "corrected_query": {
            "type": "STRING",
            "description": "The traveler's input message, corrected for speech-to-text typos."
        },
        "reply": {
            "type": "STRING",
            "description": "Your warm, concise, and helpful response."
        },
        "actions": {
            "type": "ARRAY",
            "description": "List of actions to execute on the page.",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "type": {
                        "type": "STRING",
                        "description": "Action name, e.g. update_itinerary, add_activity, remove_activity, navigate, set_dates, update_preferences, synthesize_journey, show_day."
                    },
                    "params": {
                        "type": "OBJECT",
                        "description": "Parameters for the action.",
                        "properties": {
                            "path": {"type": "STRING", "description": "Routing path for navigate action (e.g. /profile, /preferences, /timeline)."},
                            "city": {"type": "STRING", "description": "City name for update_itinerary action."},
                            "destination": {"type": "STRING", "description": "Destination city name for add_destination action."},
                            "title": {"type": "STRING", "description": "Activity title name."},
                            "time": {"type": "STRING", "description": "Activity start time (e.g. 1:30 PM)."},
                            "location": {"type": "STRING", "description": "Activity location name."},
                            "durationMinutes": {"type": "INTEGER", "description": "Activity duration in minutes."},
                            "amount": {"type": "INTEGER", "description": "Budget amount for set_budget action."},
                            "currency": {"type": "STRING", "description": "Budget currency (e.g. USD) for set_budget action."},
                            "startDate": {"type": "STRING", "description": "Trip start date (from date) for set_dates action (YYYY-MM-DD)."},
                            "endDate": {"type": "STRING", "description": "Trip end date (to date) for set_dates action (YYYY-MM-DD)."},
                            "composition": {"type": "STRING", "description": "Traveler composition, e.g. solo traveler, couple, family with kids, friends group, senior citizens."},
                            "dietaryPrefs": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                                "description": "Dietary preferences, e.g. vegetarian, vegan, jain, halal, kosher."
                            },
                            "interests": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                                "description": "Special interests, e.g. photography, architecture, history and archaeology, etc."
                            },
                            "allergies": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                                "description": "Gastronomy allergy list, e.g. peanuts, tree nuts, seafood, gluten."
                            },
                            "dayStart": {"type": "STRING", "description": "Active day start cycle time, e.g. 08:00."},
                            "dayEnd": {"type": "STRING", "description": "Active day end cycle time, e.g. 21:00."},
                            "day": {"type": "INTEGER", "description": "The day number to show on the timeline page."},
                            "lat": {"type": "NUMBER", "description": "Latitude float value for set_start_location or add_activity."},
                            "lng": {"type": "NUMBER", "description": "Longitude float value for set_start_location or add_activity."},
                            "label": {"type": "STRING", "description": "Label name for set_start_location (e.g. CTR, My Hotel)."}
                        }
                    }
                },
                "required": ["type"]
            }
        }
    },
    "required": ["corrected_query", "reply"]
}

ORA_MEMORY_UPDATE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {
            "type": "STRING",
            "description": "Prose summary under 150 words of traveler attributes."
        },
        "facts": {
            "type": "ARRAY",
            "description": "Extracted discrete traveler facts.",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "fact_type": {
                        "type": "STRING",
                        "description": "e.g. dietary_restriction, travel_preference, explicit_correction, budget_range"
                    },
                    "fact_key": {
                        "type": "STRING",
                        "description": "e.g. food_no_meat, budget_high, pace_slow"
                    },
                    "fact_value": {
                        "type": "STRING",
                        "description": "The specific value of the fact"
                    }
                },
                "required": ["fact_type", "fact_key", "fact_value"]
            }
        }
    },
    "required": ["summary"]
}

FACT_CHECK_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "is_correction": {
            "type": "BOOLEAN",
            "description": "True if the message is correcting/specifying a fact."
        },
        "fact": {
            "type": "OBJECT",
            "description": "Extracted structured fact.",
            "properties": {
                "fact_type": {
                    "type": "STRING",
                    "description": "dietary_restriction, travel_preference, budget_range, explicit_correction"
                },
                "fact_key": {
                    "type": "STRING",
                    "description": "e.g. food_no_meat, budget_high, pace_slow"
                },
                "fact_value": {
                    "type": "STRING",
                    "description": "The specific value clarified"
                }
            },
            "required": ["fact_type", "fact_key", "fact_value"]
        }
    },
    "required": ["is_correction"]
}

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
2. Incorporate the traveler's context: their page ID, visible entities, page state, and saved preferences when relevant.
3. Be warm and supportive, acting as a trusted companion.
4. IMPORTANT SAFETY DISCLOSURE: If asked for medical, mental health, or legal advice, immediately remind the user that you are an AI travel assistant, not a professional, and urge them to consult a qualified doctor, counselor, or legal expert. Do not diagnose or offer specific medical/legal advice.
5. ACTIONS / TOOL CALLING: You can take real actions on the page by emitting structured commands in the "actions" field.
   - You MUST ONLY emit action types that are currently whitelisted in the "Permitted Whitelisted Actions" list below. Emitting any other action type is strictly forbidden and will be dropped.
   - Always keep your verbal "reply" meaningful even when emitting an action (never say "done" or rely on the action alone; explain what you did, e.g. "I've added Ryoan-ji to your itinerary for today").

6. REAL PLACES AND RESTAURANTS:
   - When suggesting places, food joints, cafes, or restaurants, you MUST suggest real-world, actual existing establishments with their real names and locations (e.g., CTR (Shree Sagar) in Malleshwaram, Vidyarthi Bhavan in Gandhi Bazaar, Mavalli Tiffin Room (MTR) near Lalbagh, or Koshy's on St. Mark's Road) rather than generic descriptors (like "a place known for South Indian food" or "a local restaurant").
   - Never generate placeholders or imaginary locations. Ground all recommendations in real, actual, verifiable geographical facts.

7. STELLORA USER JOURNEY WORKFLOW DIRECTIVES:
   - **Page: 'seven-pillars' (Pre-trip Customization)**:
     - Ask the user suitable questions to collect their pre-trip details: destination (using `add_destination`), dates from and to date (using `set_dates`), budget (using `set_budget`), and preferences.
     - Specifically make sure to ask and take in their special interests (e.g. photography, history), their gastronomy allergies (e.g. peanuts, gluten), and traveler composition (e.g. couple, family with kids) using the `update_preferences` action.
     - Help them fill out these details one or two questions at a time in a friendly, conversational manner.
     - Once the core inputs (especially destination and dates) are collected, or when they tell you they are ready, invoke `synthesize_journey` to automatically generate the itinerary and push them to the curate page.
   - **Page: 'curate' (Itinerary Curation)**:
     - State clearly which places/destinations were selected for their itinerary.
     - Ask the user if they need to refine the whole itinerary (e.g. if they want to add/remove stops, adjust timings, or swap activities).
     - When refining the itinerary, always respect the active travel window (start/end times) chosen by the user in `travelWindow` (found in the page state context). Ensure that any added activities fit strictly within these active hours!
     - When recommending or adding places, you MUST suggest places and restaurants that align with the user's chosen preferences from the 7pillars page (specifically matching their composition, special interests, dietary preferences, budget, and gastronomy allergies).
     - Provide the option to refine the itinerary by adding (using `add_activity` with correct `dayNumber` and times) or removing (using `remove_activity`) specific items.
     - CRITICAL: If the user says "draft it", "add the itinerary", "save this plan", "draft the itinerary for day X", or asks you to add the suggested places to their draft/itinerary, you MUST generate the corresponding `add_activity` action calls (one for each suggested stop/place) or `update_itinerary` action call with all the items, to actually push the items to their page state! Do not just reply in text; always accompany your response with the actual action calls so they get reflected in the UI.
     - Whenever the user says "push to the timeline", "show the timeline", "push everything to the timeline", or right after you decide/finish drafting/refining the itinerary, you MUST generate a `navigate` action with parameter {{"path": "/timeline"}} (together with the update/add actions if items were changed) to immediately transition the user to the timeline page and show them the final plan!
     - Ask the user if they would like to see the timeline of a particular day. If they do, navigate them to the timeline page using the `navigate` action with path `/timeline`.
    - **Page: 'timeline' (Timeline Schedule)**:
      - Show the timeline of the trip.
      - Welcome the traveler to their timeline and review their schedule.
      - Check if their start location (e.g. hotel, airport, or specific spot) is set (found in `startLocation` of `userFacingState`). If not set, ask the user where they are starting or staying.
      - When they specify a start location (e.g. "I'm starting at CTR" or "My hotel is Vidyarthi Bhavan"), you MUST generate the `set_start_location` action with parameters like {{"location": "CTR (Shree Sagar)", "lat": 12.9982, "lng": 77.5693, "label": "CTR"}} (resolve the place name, search coordinates if needed, or estimate it based on the city).
      - After setting the start location, or when explicitly requested by the traveler (e.g. "rearrange the stops to make it shorter", "optimize the route", "AI arrange"), you MUST generate the `optimize_route` action with params {{}} to automatically reorder the timeline stops by shortest distance using nearest neighbor.
      - Explain the route optimization benefits (e.g. distance saved, route flow) and the crowd-aware slots to the traveler, suggesting the best real-time visit windows (e.g. early morning for low crowds at popular temples, afternoon for indoor museums, evening for markets).
      - Use `show_day` with `day` parameter to switch between days when the user requests to see a specific day's timeline.

Traveler Profile Summary:
{summarized_memory}

Traveler Facts (Discrete Profile Insights):
{traveler_facts}

Traveler Preferences:
{preferences}

Current Active Page Context:
- Page ID: {page_id}
- Visible Entities on Page: {visible_entities}
- Current Page State: {user_facing_state}

Other Registered Pages in App (you can navigate to them, but cannot take actions on them directly without navigating first):
{other_pages_context}

Permitted Whitelisted Actions for this Page:
{available_actions}

Action Parameter Guidelines:
- navigate: params={{"path": "/preferences" | "/smart-itinerary" | "/pretrip/7pillars" | "/profile" | "/timeline"}}
- update_itinerary: params={{"city": "CityName"}} or params={{"items": [...]}}
- add_activity: params={{"title": "Activity Name", "time": "12:00 PM", "location": "Venue Name", "durationMinutes": 60, "dayNumber": 1}}
- remove_activity: params={{"title": "Activity Name", "dayNumber": 1}}
- set_budget: params={{"amount": 5000, "currency": "USD"}}
- add_destination: params={{"destination": "CityName"}}
- set_dates: params={{"startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}}
- update_preferences: params={{"composition": "solo traveler" | "couple" | "family with kids", "dietaryPrefs": ["vegetarian"], "interests": ["photography"], "allergies": ["peanuts", "seafood"]}}
- synthesize_journey: params={{}}
- show_day: params={{"day": 2}}
- set_start_location: params={{"location": "Venue Name", "lat": 12.9716, "lng": 77.5946, "label": "Start Label"}}
- optimize_route: params={{}}

Relevant Past Context (semantic retrieval):
{relevant_past_context}
"""

def check_safety_crisis(text: str) -> bool:
    """Returns True if the text contains crisis or self-harm indicators."""
    cleaned = text.lower()
    for word in CRISIS_KEYWORDS:
        if word in cleaned:
            return True
    return False

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_v1 = math.sqrt(sum(a * a for a in v1))
    norm_v2 = math.sqrt(sum(b * b for b in v2))
    if norm_v1 == 0.0 or norm_v2 == 0.0:
        return 0.0
    return dot_product / (norm_v1 * norm_v2)

async def get_embedding(text: str) -> Optional[List[float]]:
    try:
        from google import genai
        gemini_keys = get_gemini_keys()
        if not gemini_keys:
            return None
        client = genai.Client(api_key=gemini_keys[0])
        
        # Try primary embedding model first, then standard fallback
        models_to_try = ["text-embedding-004", "embedding-001"]
        for model in models_to_try:
            try:
                def call():
                    return client.models.embed_content(
                        model=model,
                        contents=text
                    )
                response = await asyncio.get_event_loop().run_in_executor(None, call)
                if response and response.embeddings:
                    return response.embeddings[0].values
            except Exception as e:
                logger.warning(f"Embedding model {model} failed: {e}")
    except Exception as e:
        logger.warning(f"Failed to generate embedding: {e}")
    return None

async def _generate_and_store_embedding(user_id: str, message_id: str, text: str):
    emb = await get_embedding(text)
    if emb:
        await ora_db.add_message_embedding(message_id, user_id, emb)

async def get_relevant_past_context(user_id: str, message: str, exclude_ids: Set[str], k: int = 5) -> List[Dict[str, Any]]:
    try:
        query_emb = await get_embedding(message)
        if not query_emb:
            return []
        
        all_embeddings = await ora_db.get_user_message_embeddings(user_id)
        if not all_embeddings:
            return []
            
        scored_messages = []
        for item in all_embeddings:
            msg_id = item["message_id"]
            if msg_id in exclude_ids:
                continue
            
            try:
                emb_list = json.loads(item["embedding"])
                sim = cosine_similarity(query_emb, emb_list)
                scored_messages.append((msg_id, sim))
            except Exception:
                continue
        
        scored_messages.sort(key=lambda x: x[1], reverse=True)
        top_k = scored_messages[:k]
        if not top_k:
            return []
            
        msg_ids = [item[0] for item in top_k]
        messages = await ora_db.get_messages_by_ids(msg_ids)
        return messages
    except Exception as e:
        logger.warning(f"Error fetching relevant past context: {e}")
        return []

CORRECTION_HEURISTICS = [
    "no i meant", "actually i", "actually,", "i don't eat", "i dont eat",
    "that's wrong", "thats wrong", "no, i want", "no i want", "wrong,",
    "instead of", "change that to", "prefer", "correction:"
]

async def detect_and_save_immediate_correction(user_id: str, message: str):
    cleaned = message.lower()
    has_heuristics = any(phrase in cleaned for phrase in CORRECTION_HEURISTICS)
    if not has_heuristics:
        return
        
    logger.info(f"Correction heuristic matched for message: {message}. Extracting fact immediately...")
    prompt = f"""You are a travel assistant memory parser.
Analyze the traveler's message and determine if they are correcting a preference, budget, dietary restriction, or past fact.
If so, extract the single structured fact they are clarifying.
If they are NOT correcting or expressing a preference, return an empty JSON object.

Traveler message: "{message}"

Your response must be in JSON format matching this schema:
{{
  "is_correction": true/false,
  "fact": {{
    "fact_type": "dietary_restriction" or "travel_preference" or "budget_range" or "explicit_correction",
    "fact_key": "e.g. food_no_meat, budget_high, pace_slow",
    "fact_value": "The specific value clarified"
  }}
}}
"""
    try:
        from google import genai
        from google.genai import types
        gemini_keys = get_gemini_keys()
        if not gemini_keys:
            return
        client = genai.Client(api_key=gemini_keys[0])
        
        def call():
            config = types.GenerateContentConfig(
                temperature=0.0,
                response_mime_type="application/json",
                response_schema=FACT_CHECK_SCHEMA
            )
            return client.models.generate_content(
                model="gemini-2.5-flash-lite",
                contents=prompt,
                config=config
            )
            
        res = await asyncio.get_event_loop().run_in_executor(None, call)
        if res and res.text:
            data = json.loads(res.text.strip())
            if data.get("is_correction") and data.get("fact"):
                fact = data["fact"]
                await ora_db.upsert_user_fact(
                    user_id=user_id,
                    fact_type=fact["fact_type"],
                    fact_key=fact["fact_key"],
                    fact_value=fact["fact_value"],
                    confidence=0.9
                )
                logger.info(f"Immediate correction fact upserted: {fact['fact_key']} = {fact['fact_value']}")
    except Exception as e:
        logger.warning(f"Failed to detect immediate correction: {e}")

async def get_ai_reply(
    user_id: str,
    message: str,
    page_context: Optional[Dict[str, Any]] = None,
    history_limit: int = 15,
    other_pages_summary: Optional[List[Dict[str, Any]]] = None
) -> Tuple[str, str, List[Dict[str, Any]], bool]:
    """
    Core dialog handler.
    1. Runs safety checks on inputs.
    2. Builds LLM system instructions & history context.
    3. Requests Gemini with structured schema for actions & dialog.
    4. Auto-falls back to Groq Llama 3.3 under rate limits/exceptions.
    5. Saves corrected user message and assistant reply to DB.
    6. Validates actions server-side against page whitelist.
    """
    if check_safety_crisis(message):
        logger.warning(f"Safety trigger matched for user: {user_id}")
        await ora_db.add_message(user_id, "user", message)
        await ora_db.add_message(user_id, "assistant", CRISIS_RESPONSE)
        return CRISIS_RESPONSE, message, [], True

    profile = await ora_db.get_user_profile(user_id)
    history = await ora_db.get_history(user_id, limit=history_limit)

    page_id = "global-fallback"
    visible_entities = []
    available_actions = ["navigate"]
    user_facing_state = {}
    
    if page_context:
        page_id = page_context.get("pageId", page_id)
        visible_entities = page_context.get("visibleEntities", [])
        available_actions = page_context.get("availableActions", available_actions)
        user_facing_state = page_context.get("userFacingState", {})

    facts_list = await ora_db.get_user_facts(user_id)
    facts_str = "None"
    if facts_list:
        facts_str = "\n".join(f"- {f['fact_type']} ({f['fact_key']}): {f['fact_value']}" for f in facts_list)

    recent_ids = {str(msg["id"]) for msg in history if msg.get("id")}
    relevant_past = await get_relevant_past_context(user_id, message, recent_ids, k=5)
    past_context_str = "None"
    if relevant_past:
        past_context_str = "\n".join(
            f"- {msg['role'].upper()}: {msg['content']}"
            for msg in relevant_past
        )

    other_pages_str = "None"
    if other_pages_summary:
        other_pages_str = "\n".join(
            f"- Page: {item.get('pageId')}, Summary: {item.get('summary')}"
            for item in other_pages_summary if item
        )

    system_instruction = SYSTEM_PROMPT_TEMPLATE.format(
        summarized_memory=profile.get("summarized_memory", "None"),
        traveler_facts=facts_str,
        preferences=json.dumps(profile.get("preferences", {})),
        page_id=page_id,
        visible_entities=json.dumps(visible_entities),
        user_facing_state=json.dumps(user_facing_state),
        other_pages_context=other_pages_str,
        available_actions=json.dumps(available_actions),
        relevant_past_context=past_context_str
    )

    api_messages = []
    for msg in history:
        api_messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    api_messages.append({
        "role": "user",
        "content": message
    })

    reply_text = ""
    corrected_query = message
    actions_raw = []
    
    gemini_keys = get_gemini_keys()
    for key in gemini_keys:
        gemini_models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-flash-latest"]
        for model in gemini_models:
            try:
                masked_key = key[:8] + "..." if len(key) > 8 else "..."
                logger.info(f"Attempting ORA response via Gemini model: {model} using key: {masked_key}")
                reply_text, corrected_query, actions_raw = await _call_gemini_with_model(api_messages, system_instruction, model, api_key=key)
                if reply_text:
                    logger.info(f"ORA response successfully generated using {model}")
                    break
            except Exception as e:
                logger.warning(f"Gemini model {model} failed with key {masked_key}: {e}. Trying next...")
        if reply_text:
            break
    
    if not reply_text:
        groq_keys = get_groq_keys()
        for g_key in groq_keys:
            try:
                masked_gkey = g_key[:8] + "..." if len(g_key) > 8 else "..."
                logger.info(f"Attempting ORA response via Groq Llama 3.3 using key: {masked_gkey}")
                reply_text, corrected_query, actions_raw = await _call_groq(api_messages, system_instruction, api_key=g_key)
                if reply_text:
                    logger.info("ORA response successfully generated using Groq Llama 3.3")
                    break
            except Exception as e:
                logger.error(f"Groq fallback failed with key {masked_gkey}: {e}")
            
    if not reply_text:
        reply_text = (
            "I'm having a little trouble connecting to my brain right now, "
            "but I'm still here with you. Please try saying that again in a moment."
        )

    user_msg_record = await ora_db.add_message(user_id, "user", corrected_query)
    assistant_msg_record = await ora_db.add_message(user_id, "assistant", reply_text)

    if user_msg_record and "id" in user_msg_record:
        asyncio.create_task(_generate_and_store_embedding(user_id, user_msg_record["id"], corrected_query))
    if assistant_msg_record and "id" in assistant_msg_record:
        asyncio.create_task(_generate_and_store_embedding(user_id, assistant_msg_record["id"], reply_text))

    asyncio.create_task(detect_and_save_immediate_correction(user_id, message))

    validated_actions = []
    for act in actions_raw:
        act_type = act.get("type")
        if act_type in available_actions:
            validated_actions.append(act)
        else:
            logger.warning(f"ORA: Disallowed action type '{act_type}' emitted by model. Whitelist: {available_actions}")

    # Explicit push-to-timeline rule:
    # If the user is on the 'curate' page, and:
    # 1. The model emits 'update_itinerary' (which updates/decides the draft itinerary).
    # 2. Or the user explicitly asks to push, save, draft, show the timeline, or says "looks good", "perfect", "done".
    # We must ensure there is a navigate to '/timeline' action.
    if page_id == "curate":
        has_update_itinerary = any(a.get("type") == "update_itinerary" for a in validated_actions)
        has_navigate_timeline = any(a.get("type") == "navigate" and a.get("params", {}).get("path") == "/timeline" for a in validated_actions)
        
        user_wants_timeline = False
        cleaned_msg = message.lower()
        cleaned_corrected = corrected_query.lower()
        cleaned_reply = reply_text.lower()
        
        timeline_keywords = ["timeline", "push", "save", "done", "looks good", "perfect", "looks great", "draft", "decide", "go to", "show me"]
        if any(kw in cleaned_msg or kw in cleaned_corrected or kw in cleaned_reply for kw in timeline_keywords):
            user_wants_timeline = True
            
        if (has_update_itinerary or user_wants_timeline) and not has_navigate_timeline:
            if "navigate" in available_actions:
                logger.info("ORA Post-processing: Automatically adding navigate to /timeline action to push draft itinerary.")
                validated_actions.append({
                    "type": "navigate",
                    "params": {"path": "/timeline"}
                })

    return reply_text, corrected_query, validated_actions, False

async def _call_gemini_with_model(messages: List[Dict[str, str]], system_instruction: str, model_name: str, api_key: str = None) -> Tuple[str, str, List[Dict[str, Any]]]:
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
            response_schema=ORA_RESPONSE_SCHEMA
        )
        return client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config
        )
        
    response = await asyncio.get_event_loop().run_in_executor(None, call)
    
    reply_text = ""
    corrected_query = messages[-1]["content"] if messages else ""
    actions_list = []
    
    if response and response.text:
        try:
            data = json.loads(response.text.strip())
            reply_text = data.get("reply", "").strip()
            corrected_query = data.get("corrected_query", "").strip()
            actions_list = data.get("actions", [])
        except Exception as e:
            logger.warning(f"Structured ORA response parse failed for {model_name}: {e}. Raw response: {response.text}")
            reply_text = response.text.strip()
            
    return reply_text, corrected_query, actions_list

async def _call_groq(messages: List[Dict[str, str]], system_instruction: str, api_key: str = None) -> Tuple[str, str, List[Dict[str, Any]]]:
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
        "  \"corrected_query\": \"The traveler's input message, corrected for speech-to-text typos.\",\n"
        "  \"reply\": \"Your warm, concise, and helpful response to the user.\",\n"
        "  \"actions\": [\n"
        "    { \"type\": \"action_type\", \"params\": {} }\n"
        "  ]\n"
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
        "max_tokens": 800,
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
    actions_list = []
    
    try:
        parsed = json.loads(raw_content)
        reply_text = parsed.get("reply", "").strip()
        corrected_query = parsed.get("corrected_query", "").strip()
        actions_list = parsed.get("actions", [])
    except Exception as e:
        logger.warning(f"Structured Groq response parse failed: {e}. Raw content: {raw_content}")
        reply_text = raw_content
        
    return reply_text, corrected_query, actions_list

async def transcribe_groq_whisper(audio_bytes: bytes, filename: str = "audio.wav", mime_type: str = "audio/wav") -> str:
    """
    Transcribes audio using Groq Hosted Whisper model or falls back to Gemini 2.5 native transcription.
    """
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

    gemini_keys = get_gemini_keys()
    for gem_key in gemini_keys:
        try:
            from google import genai
            from google.genai import types
            
            client = genai.Client(api_key=gem_key)
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
                            break
                    except Exception as e:
                        logger.warning(f"Transcription via {model_name} failed on attempt {attempt+1} with key {masked_key}: {e}")
                        await asyncio.sleep(1.0)
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
    and extracts structured facts.
    """
    profile = await ora_db.get_user_profile(user_id)
    history = await ora_db.get_history(user_id, limit=35)
    
    if len(history) < 10:
        return False

    conv_log = ""
    for msg in history:
        conv_log += f"{msg['role'].upper()}: {msg['content']}\n"

    prompt = f"""You are ORA's background memory coordinator.
Analyze the following conversation history and the existing traveler profile summary.
Generate an updated, extremely concise (under 150 words) summary of key facts about the traveler (e.g. name, preferences, food limits, itinerary choices, or past corrections).
In addition, extract discrete traveler facts for structured storage.

Existing Profile Memory:
{profile.get('summarized_memory', 'None')}

Recent Conversation Logs:
{conv_log}

You must respond in JSON format matching this schema:
{{
  "summary": "Prose summary under 150 words of traveler attributes.",
  "facts": [
    {{
      "fact_type": "dietary_restriction" or "travel_preference" or "budget_range" or "explicit_correction",
      "fact_key": "e.g. food_no_meat, budget_high, pace_slow",
      "fact_value": "The specific value of the fact"
    }}
  ]
}}
"""

    summary_text = ""
    extracted_facts = []
    
    gemini_keys = get_gemini_keys()
    for gem_key in gemini_keys:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=gem_key)
        gemini_models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-flash-latest"]
        masked_key = gem_key[:8] + "..." if len(gem_key) > 8 else "..."
        for model in gemini_models:
            try:
                logger.info(f"Attempting ORA memory summary via Gemini model: {model} using key: {masked_key}")
                def call():
                    config = types.GenerateContentConfig(
                        temperature=0.3,
                        response_mime_type="application/json",
                        response_schema=ORA_MEMORY_UPDATE_SCHEMA
                    )
                    return client.models.generate_content(
                        model=model,
                        contents=prompt,
                        config=config
                    )
                res = await asyncio.get_event_loop().run_in_executor(None, call)
                if res and res.text:
                    parsed = json.loads(res.text.strip())
                    summary_text = parsed.get("summary", "").strip()
                    extracted_facts = parsed.get("facts", [])
                    logger.info(f"ORA memory summary successfully generated using {model}")
                    break
            except Exception as e:
                logger.warning(f"Gemini model {model} failed for memory summary with key {masked_key}: {e}. Trying next fallback...")
        if summary_text:
            break

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
                    "max_tokens": 800,
                    "response_format": {"type": "json_object"}
                }
                async with httpx.AsyncClient(timeout=12) as client:
                    res = await client.post(url, headers=headers, json=payload)
                if not res.is_error:
                    parsed = res.json()
                    raw_content = parsed["choices"][0]["message"]["content"].strip()
                    parsed_json = json.loads(raw_content)
                    summary_text = parsed_json.get("summary", "").strip()
                    extracted_facts = parsed_json.get("facts", [])
                    logger.info("ORA memory summary successfully generated using Groq Llama 3.3")
                    break
            except Exception as e:
                logger.warning(f"Groq memory summary failed with key {masked_gkey}: {e}")

    if summary_text:
        await ora_db.save_user_profile(user_id, summary_text, profile.get("preferences", {}))
        for fact in extracted_facts:
            await ora_db.upsert_user_fact(
                user_id=user_id,
                fact_type=fact.get("fact_type", "travel_preference"),
                fact_key=fact.get("fact_key", "general"),
                fact_value=fact.get("fact_value", "")
            )
        logger.info(f"ORA memory summary and structured facts updated for user: {user_id}")
        return True
    return False
