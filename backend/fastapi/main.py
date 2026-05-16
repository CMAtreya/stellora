import asyncio
import base64
import logging
import math
import os
import random
import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import quote, urlparse
from uuid import uuid4
from difflib import SequenceMatcher
import json
import yt_dlp
from google import genai
# Removed: Google Cloud Vision (unused and requires additional dependencies)
import tempfile
import uuid

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.services.instagram import get_instagram_caption

BASE_DIR = os.path.dirname(__file__)
# Load environment from both backend/fastapi/.env and backend/.env (workspace-level backend env).
# Use override=True so local project env changes take effect immediately in dev.
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)
load_dotenv(os.path.join(os.path.dirname(BASE_DIR), ".env"), override=True)
load_dotenv(override=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stellora")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
# DEPRECATED: Google Places API is no longer used - replaced with free Photon + Unsplash
# GOOGLE_PLACES_API_KEY = (
#     os.getenv("GOOGLE_SERVER_API_KEY")
#     or os.getenv("GOOGLE_PLACES_API_KEY")
#     or os.getenv("GOOGLE_MAPS_API_KEY")
# )
OPENTRIPMAP_API_KEY = os.getenv("OPENTRIPMAP_API_KEY") or os.getenv("OPEN_TRIPMAP_API_KEY")
_OTM_GEONAME_DISABLED = False
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
MAX_PROXY_BYTES = int(os.getenv("MAX_PROXY_BYTES", 8 * 1024 * 1024))
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
_OPENWEATHER_DISABLED = False

gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

_GEMINI_MODEL_CACHE: Dict[str, Any] = {"models": [], "expires_at": 0.0}
_GEMINI_FASTPASS_BLOCK_UNTIL = 0.0
_CITY_BEST_MONTH_CACHE: Dict[str, Dict[str, Any]] = {}


def parse_retry_delay_seconds(error_text: str) -> int:
    """Best-effort extraction of retry delay from Gemini 429 payload."""
    try:
        payload = json.loads(error_text)
        details = payload.get("error", {}).get("details") or []
        for item in details:
            retry = item.get("retryDelay")
            if isinstance(retry, str):
                match = re.match(r"^(\d+)s$", retry.strip())
                if match:
                    return max(5, int(match.group(1)))
    except Exception:
        pass
    return 60


def normalize_month_abbrev(value: str) -> str:
    mapping = {
        "january": "Jan", "jan": "Jan",
        "february": "Feb", "feb": "Feb",
        "march": "Mar", "mar": "Mar",
        "april": "Apr", "apr": "Apr",
        "may": "May",
        "june": "Jun", "jun": "Jun",
        "july": "Jul", "jul": "Jul",
        "august": "Aug", "aug": "Aug",
        "september": "Sep", "sep": "Sep", "sept": "Sep",
        "october": "Oct", "oct": "Oct",
        "november": "Nov", "nov": "Nov",
        "december": "Dec", "dec": "Dec",
    }
    lowered = (value or "").strip().lower()
    if lowered in mapping:
        return mapping[lowered]
    for token in re.split(r"\W+", lowered):
        if token in mapping:
            return mapping[token]
    return "Apr"


async def get_gemini_generate_models() -> List[str]:
    """Return supported generateContent models, cached briefly to limit API calls."""
    now = time.time()
    if _GEMINI_MODEL_CACHE["models"] and _GEMINI_MODEL_CACHE["expires_at"] > now:
        return _GEMINI_MODEL_CACHE["models"]

    if not GEMINI_API_KEY:
        return []

    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            res = await client.get(url)
        if res.is_error:
            logger.warning("gemini ListModels failed: %s", res.text)
            return []
        payload = res.json() if res.content else {}
        models = payload.get("models") or []
        supported: List[str] = []
        for model in models:
            name = model.get("name")
            methods = model.get("supportedGenerationMethods") or []
            if not name or "generateContent" not in methods:
                continue
            if isinstance(name, str) and name.startswith("models/"):
                supported.append(name.split("models/", 1)[1])

        _GEMINI_MODEL_CACHE["models"] = supported
        _GEMINI_MODEL_CACHE["expires_at"] = now + 300
        return supported
    except Exception as exc:
        logger.warning("gemini ListModels exception: %s", exc)
        return []

app = FastAPI()
allowed_origin = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173").strip()
allow_origins = [origin.strip() for origin in allowed_origin.split(",") if origin.strip()] if allowed_origin != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_place_query(ai_result: Dict[str, Any]) -> Optional[str]:
    if not ai_result or not ai_result.get("place_detected"):
        return None
    name = ai_result.get("place_name") or ""
    address = ai_result.get("address_hint") or ""
    city = ai_result.get("city") or ""
    if not name.strip():
        return None
    if address.strip():
        return f"{name}, {address}"
    return f"{name} restaurant {city}".strip()


def normalize_query(text: str) -> str:
    if not text:
        return ""
    cleaned = text.replace("’", "'").replace("“", "\"").replace("”", "\"")
    cleaned = "".join(ch for ch in cleaned if ch.isprintable())
    return " ".join(cleaned.split())


_NOISY_PLACE_QUERY_TOKENS = {
    "opening", "open", "grand", "launch", "new", "soon", "today", "tomorrow", "yesterday",
    "definitely", "must", "visit", "viral", "trending", "reels", "reel", "experience", "centre",
    "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
}

_INDIA_STATE_TOKENS = {
    "karnataka", "kerala", "tamil nadu", "andhra pradesh", "telangana", "maharashtra", "delhi",
    "gujarat", "rajasthan", "uttar pradesh", "west bengal", "odisha", "punjab", "haryana",
}

_LOCALITY_TO_CITY_HINTS = {
    "bommasandra": "Bengaluru",
    "hosur road": "Bengaluru",
    "electronic city": "Bengaluru",
    "koramangala": "Bengaluru",
    "indiranagar": "Bengaluru",
}


def sanitize_place_query(query: str) -> str:
    """Trim obvious non-location noise tokens from free-text caption queries."""
    normalized = normalize_query(query)
    if not normalized:
        return ""

    raw_tokens = [t for t in re.split(r"\s+", normalized) if t]
    cleaned_tokens: List[str] = []
    for token in raw_tokens:
        bare = re.sub(r"[^A-Za-z0-9']+", "", token).strip().lower()
        if not bare:
            continue
        if bare.startswith("#"):
            continue
        if bare in _NOISY_PLACE_QUERY_TOKENS:
            continue
        cleaned_tokens.append(token)

    # Guardrail: avoid returning empty/too-short queries after cleaning.
    if len(cleaned_tokens) >= 2:
        return normalize_query(" ".join(cleaned_tokens))
    return normalized


def infer_city_from_text(text: str) -> str:
    normalized = normalize_query(text).lower()
    if not normalized:
        return ""
    if "bengaluru" in normalized or "bangalore" in normalized:
        return "Bengaluru"
    for locality, city in _LOCALITY_TO_CITY_HINTS.items():
        if locality in normalized:
            return city
    return ""


def extract_city_from_address(address: str) -> str:
    normalized = normalize_query(address)
    if not normalized:
        return ""

    inferred = infer_city_from_text(normalized)
    if inferred:
        return inferred

    road_terms = {"road", "rd", "street", "st", "main", "cross", "layout", "area", "phase", "block"}
    parts = [p.strip() for p in normalized.split(",") if p and p.strip()]
    for part in reversed(parts):
        lowered = part.lower()
        if re.search(r"\b\d{5,6}\b", lowered):
            continue
        if lowered in {"india", "united states", "uk", "united kingdom"}:
            continue
        if lowered in _INDIA_STATE_TOKENS:
            continue
        tokens = [t for t in re.split(r"\s+", lowered) if t]
        if tokens and tokens[-1] in road_terms:
            continue
        if len(tokens) <= 1 and tokens and len(tokens[0]) <= 3:
            continue
        return part
    return ""


def infer_place_name_from_caption(text: str) -> str:
    """Infer the primary venue name from caption lines."""
    if not text:
        return ""

    lines = [normalize_query(line) for line in text.splitlines() if normalize_query(line)]
    if not lines:
        return ""

    for idx, line in enumerate(lines):
        lowered = line.lower()
        if "location" in lowered or "📍" in line:
            cleaned = line.replace("📍", " ")
            for marker in ["Location", "location", "LOCATION", ":", "-"]:
                cleaned = cleaned.replace(marker, " ")
            cleaned = normalize_query(" ".join(cleaned.split()))
            bad_tokens = ["road", "rd", "main", "street", "area", "karnataka", "bengaluru", "india", "club house"]
            if cleaned and len(cleaned.split()) <= 6 and not any(token in cleaned.lower() for token in bad_tokens):
                return cleaned
            if idx + 1 < len(lines):
                nxt = lines[idx + 1]
                if nxt and len(nxt.split()) <= 6 and not any(token in nxt.lower() for token in bad_tokens):
                    return nxt

    # Prefer lines with business cues.
    business_cues = ["cafe", "restaurant", "hotel", "eatery", "diner", "bistro"]
    for line in lines:
        lowered = line.lower()
        if "location" in lowered or "opening" in lowered or "public" in lowered:
            continue
        if any(cue in lowered for cue in business_cues):
            cleaned = re.sub(r"^(this is (the )?reel (on|about)\s+)", "", line, flags=re.IGNORECASE)
            cleaned = re.sub(r"[!?.]+$", "", cleaned).strip()
            # Trim trailing generic marketing words.
            cleaned = re.sub(r"\b(experience|centre|center)\b\s*$", "", cleaned, flags=re.IGNORECASE).strip()
            return cleaned

    # Backup: first informative line.
    for line in lines:
        lowered = line.lower()
        if "location" in lowered or "opening" in lowered or "public" in lowered:
            continue
        return re.sub(r"[!?.]+$", "", line).strip()

    return ""


def build_unverified_destination(name_hint: str, address_hint: str = "", city_hint: str = "") -> Optional[Dict[str, Any]]:
    """Create a best-effort destination object when Places lookup has no usable result."""
    name = normalize_query(name_hint)
    address = normalize_query(address_hint)
    city = normalize_query(city_hint)
    if not city:
        city = infer_city_from_text(address)

    if not name:
        return None

    maps_query = quote(" ".join([p for p in [name, city or address] if p]))
    return {
        "id": f"reel-unverified-{uuid4().hex[:10]}",
        "name": name,
        "address": address or city or "From reel caption",
        "vicinity": address or city or None,
        "city": city or None,
        "category": "food-dining",
        "source": "reel",
        "reasoning": "Detected from reel caption (unverified)",
        "maps_link": f"https://www.google.com/maps/search/?api=1&query={maps_query}",
        "lat": None,
        "lng": None,
        "photoUrl": None,
    }


def extract_location_block(text: str) -> tuple[str, str]:
    """Extract explicit venue name and address from a Location block."""
    if not text:
        return "", ""
    lines = [normalize_query(line) for line in text.splitlines() if normalize_query(line)]
    for idx, line in enumerate(lines):
        lowered = line.lower()
        if "location" in lowered or "📍" in line:
            cleaned = line.replace("📍", " ")
            for marker in ["Location", "location", "LOCATION", ":", "-"]:
                cleaned = cleaned.replace(marker, " ")
            cleaned = normalize_query(" ".join(cleaned.split()))
            address = lines[idx + 1] if idx + 1 < len(lines) else ""
            return cleaned, address
    return "", ""


def clean_caption_for_extraction(text: str) -> str:
    """Remove obvious Instagram metadata noise before caption parsing."""
    if not text:
        return ""

    cleaned = text.replace("\r\n", "\n").strip()
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    if not lines:
        return ""

    # Drop the common likes/comments header when present.
    if re.search(r"likes?,\s*\d+[\d,\.]*\s+comments?", lines[0], re.IGNORECASE):
        lines = lines[1:]

    cleaned = "\n".join(lines).strip()
    cleaned = re.sub(
        r"^\s*[\d,\.]+\s+likes?,\s*[\d,\.]+\s+comments?\s*-\s*[^:]+:\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = cleaned.lstrip('"“').rstrip('"”').strip()
    return cleaned


def choose_best_caption(*candidates: Optional[str]) -> str:
    """Pick the most complete caption while preserving structured line breaks."""
    cleaned: List[str] = []
    for candidate in candidates:
        if isinstance(candidate, str):
            text = candidate.strip()
            if text:
                cleaned.append(text)
    if not cleaned:
        return ""

    def score(text: str) -> tuple[int, int, int]:
        # Prefer more structured captions, then longer text, then more content overall.
        return (text.count("\n"), len(text), len(text.split()))

    return max(cleaned, key=score)


def canonicalize_instagram_reel_url(raw_url: str) -> Optional[str]:
    """Return a normalized Instagram reel/post URL or None if input is invalid."""
    if not raw_url:
        return None

    value = raw_url.strip()
    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"

    parsed = urlparse(value)
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]

    if host not in {"instagram.com", "instagr.am"}:
        return None

    path = (parsed.path or "").rstrip("/")
    match = re.match(r"^/(reel|reels|p)/([A-Za-z0-9_-]+)$", path, re.IGNORECASE)
    if not match:
        return None

    kind = match.group(1).lower()
    shortcode = match.group(2)
    return f"https://www.instagram.com/{kind}/{shortcode}/"


def is_similar(a: str, b: str) -> bool:
    if not a or not b:
        return False
    return SequenceMatcher(None, a.lower(), b.lower()).ratio() > 0.55


def extract_must_try(text: str) -> Optional[str]:
    """Lightweight heuristic to pull a 'must try' dish from the caption text."""
    if not text:
        return None
    lowered = text.lower()
    # Priority: explicit "must try" phrases
    markers = ["must try", "must-try", "favorite", "favourite", "loved", "worth the hype", "damn good"]
    if any(m in lowered for m in markers):
        sentences = [s.strip() for s in text.replace("\n", " ").split('.') if s.strip()]
        for s in sentences:
            if any(m in s.lower() for m in markers):
                return s.strip()
    # Fallback: first sentence that mentions pizza / dish keywords
    dish_words = ["pizza", "burrata", "salad", "cheese", "thali", "dos", "dosa", "biriyani", "biryani"]
    sentences = [s.strip() for s in text.replace("\n", " ").split('.') if s.strip()]
    for s in sentences:
        if any(w in s.lower() for w in dish_words):
            return s.strip()
    return None


async def geocode_city(city: str) -> Optional[Dict[str, float]]:
    """Resolve city name to lat/lng. Prefer OpenWeather geocoding, fallback to Open-Meteo."""
    if not city:
        return None

    # 1) OpenWeather direct geocoding if key is present
    if WEATHER_API_KEY:
        url = "https://api.openweathermap.org/geo/1.0/direct"
        params = {"q": city, "limit": 1, "appid": WEATHER_API_KEY}
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                res = await client.get(url, params=params)
            if not res.is_error:
                data = res.json() or []
                if isinstance(data, list) and data:
                    hit = data[0]
                    return {"lat": hit.get("lat"), "lng": hit.get("lon")}
        except Exception:
            pass

    # 2) Fallback: Open-Meteo geocoding
    url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": city, "count": 1, "language": "en", "format": "json"}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.get(url, params=params)
        if res.is_error:
            return None
        data = res.json()
        results = data.get("results") or []
        if not results:
            return None
        hit = results[0]
        return {"lat": hit.get("latitude"), "lng": hit.get("longitude")}
    except Exception:
        return None


async def fetch_weather_hint(city: str, title: str, lat: Optional[float], lng: Optional[float]) -> Optional[Dict[str, Any]]:
    """Fetch a simple weather guidance for a place using OpenWeather (pref), fallback to Open-Meteo."""
    coord = None
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        coord = {"lat": lat, "lng": lng}
    elif city:
        coord = await geocode_city(city)
    if not coord:
        return None

    async def eval_from_times(times: List[Any], temps: List[Any]) -> Optional[Dict[str, Any]]:
        slots = {"morning": [], "afternoon": [], "evening": []}
        for t_str, temp in zip(times, temps):
            if not isinstance(temp, (int, float)):
                continue
            try:
                if "T" in str(t_str):
                    hour = int(str(t_str).split("T")[1].split(":")[0])
                else:
                    # OpenWeather returns unix seconds
                    hour = datetime.utcfromtimestamp(int(t_str)).hour
            except Exception:
                continue
            if hour < 12:
                slots["morning"].append(temp)
            elif hour < 17:
                slots["afternoon"].append(temp)
            else:
                slots["evening"].append(temp)

        def avg(lst: List[float]) -> Optional[float]:
            return sum(lst) / len(lst) if lst else None

        morning = avg(slots["morning"])
        afternoon = avg(slots["afternoon"])
        evening = avg(slots["evening"])

        best_time = "afternoon"
        note = "Comfortable across the day."
        ref_temp = afternoon or morning or evening
        if afternoon and afternoon > 32:
            best_time = "evening"
            ref_temp = afternoon
            note = "Shifted to evening to dodge afternoon heat."
        elif morning and (afternoon or 0) - morning > 3:
            best_time = "morning"
            ref_temp = morning
            note = "Cooler in the morning vs later."
        elif evening and (afternoon or 0) - evening > 2:
            best_time = "evening"
            ref_temp = evening
            note = "More comfortable later in the day."

        return {
            "bestTime": best_time,
            "tempC": ref_temp,
            "condition": None,
            "note": note,
            "lat": coord["lat"],
            "lng": coord["lng"],
        }

    # Prefer OpenWeather One Call if key present
    global _OPENWEATHER_DISABLED
    if WEATHER_API_KEY and not _OPENWEATHER_DISABLED:
        try:
            url = "https://api.openweathermap.org/data/2.5/onecall"
            params = {
                "lat": coord["lat"],
                "lon": coord["lng"],
                "appid": WEATHER_API_KEY,
                "units": "metric",
                "exclude": "minutely,daily,alerts",
            }
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(url, params=params)
            if res.status_code == 401:
                _OPENWEATHER_DISABLED = True
                logger.warning("OpenWeather One Call unauthorized; disabling OpenWeather usage for this process.")
            if not res.is_error:
                data = res.json() or {}
                hourly = data.get("hourly") or []
                times = [h.get("dt") for h in hourly]
                temps = [h.get("temp") for h in hourly]
                if times and temps:
                    hint = await eval_from_times(times, temps)
                    if hint:
                        if hourly and isinstance(hourly[0], dict):
                            hint["condition"] = hourly[0].get("weather", [{}])[0].get("description")
                        return hint
        except Exception:
            pass

    # Fallback: Open-Meteo if OpenWeather fails or missing key
    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": coord["lat"],
            "longitude": coord["lng"],
            "hourly": "temperature_2m,apparent_temperature",
            "forecast_days": 1,
            "timezone": "auto",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, params=params)
        if res.is_error:
            return None
        data = res.json() or {}
        temps = data.get("hourly", {}).get("temperature_2m") or []
        times = data.get("hourly", {}).get("time") or []
        if not temps or not times or len(temps) != len(times):
            return None
        return await eval_from_times(times, temps)
    except Exception:
        return None


async def fetch_weather_context(city: str, lat: Optional[float], lng: Optional[float], start_hour: int = 8, end_hour: int = 20) -> Dict[str, Any]:
    """Return structured hourly weather data for timeline planning."""
    coord = None
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        coord = {"lat": float(lat), "lng": float(lng)}
    elif city:
        coord = await geocode_city(city)

    default_hours = [
        {"hour": hour, "label": f"{hour:02d}:00", "tempC": None, "condition": "clear", "rainProbability": 0, "windKph": None}
        for hour in range(start_hour, end_hour + 1)
    ]
    if not coord:
        return {"city": city, "latitude": None, "longitude": None, "hourly": default_hours, "summary": {"bestWindow": "morning", "hotHours": []}}

    async def _shape_hourly(times: List[Any], temps: List[Any], conditions: Optional[List[Any]] = None, rain: Optional[List[Any]] = None, wind: Optional[List[Any]] = None) -> List[Dict[str, Any]]:
        hourly: List[Dict[str, Any]] = []
        for t_str, temp, cond, rain_value, wind_value in zip(times, temps, conditions or [], rain or [], wind or []):
            try:
                if "T" in str(t_str):
                    hour = int(str(t_str).split("T")[1].split(":")[0])
                else:
                    hour = datetime.utcfromtimestamp(int(t_str)).hour
            except Exception:
                continue
            if hour < start_hour or hour > end_hour:
                continue
            hourly.append({
                "hour": hour,
                "label": f"{hour:02d}:00",
                "tempC": round(float(temp), 1) if isinstance(temp, (int, float)) else None,
                "condition": str(cond or "clear"),
                "rainProbability": int(rain_value) if isinstance(rain_value, (int, float)) else 0,
                "windKph": round(float(wind_value), 1) if isinstance(wind_value, (int, float)) else None,
            })
        return hourly or default_hours

    try:
        global _OPENWEATHER_DISABLED
        if WEATHER_API_KEY and not _OPENWEATHER_DISABLED:
            url = "https://api.openweathermap.org/data/2.5/onecall"
            params = {
                "lat": coord["lat"],
                "lon": coord["lng"],
                "appid": WEATHER_API_KEY,
                "units": "metric",
                "exclude": "minutely,daily,alerts",
            }
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(url, params=params)
            if res.status_code == 401:
                _OPENWEATHER_DISABLED = True
                logger.warning("OpenWeather One Call unauthorized; falling back to Open-Meteo.")
            if not res.is_error:
                data = res.json() or {}
                hourly_raw = data.get("hourly") or []
                if hourly_raw:
                    hourly = await _shape_hourly(
                        [h.get("dt") for h in hourly_raw],
                        [h.get("temp") for h in hourly_raw],
                        [((h.get("weather") or [{}])[0]).get("description") for h in hourly_raw],
                        [h.get("pop", 0) * 100 for h in hourly_raw],
                        [h.get("wind_speed") for h in hourly_raw],
                    )
                    hot_hours = [h["hour"] for h in hourly if isinstance(h.get("tempC"), (int, float)) and h["tempC"] >= 32]
                    best_window = "morning" if hot_hours and min(hot_hours) <= 15 else "afternoon"
                    return {"city": city, "latitude": coord["lat"], "longitude": coord["lng"], "hourly": hourly, "summary": {"bestWindow": best_window, "hotHours": hot_hours}}
    except Exception:
        pass

    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": coord["lat"],
            "longitude": coord["lng"],
            "hourly": "temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code",
            "forecast_days": 1,
            "timezone": "auto",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, params=params)
        if res.is_error:
            return {"city": city, "latitude": coord["lat"], "longitude": coord["lng"], "hourly": default_hours, "summary": {"bestWindow": "afternoon", "hotHours": []}}
        data = res.json() or {}
        hourly_data = data.get("hourly") or {}
        temps = hourly_data.get("temperature_2m") or []
        times = hourly_data.get("time") or []
        rain = hourly_data.get("precipitation_probability") or []
        wind = hourly_data.get("wind_speed_10m") or []
        weather_code = hourly_data.get("weather_code") or []
        code_to_text = {0: "clear", 1: "mostly_clear", 2: "partly_cloudy", 3: "cloudy", 61: "rain", 63: "rain", 65: "rain", 71: "snow", 80: "showers"}
        hourly: List[Dict[str, Any]] = []
        for idx, (t_str, temp) in enumerate(zip(times, temps)):
            try:
                hour = int(str(t_str).split("T")[1].split(":")[0])
            except Exception:
                continue
            if hour < start_hour or hour > end_hour:
                continue
            hourly.append({
                "hour": hour,
                "label": f"{hour:02d}:00",
                "tempC": round(float(temp), 1) if isinstance(temp, (int, float)) else None,
                "condition": code_to_text.get(int(weather_code[idx]) if idx < len(weather_code) and isinstance(weather_code[idx], (int, float)) else 0, "clear"),
                "rainProbability": int(rain[idx]) if idx < len(rain) and isinstance(rain[idx], (int, float)) else 0,
                "windKph": round(float(wind[idx]), 1) if idx < len(wind) and isinstance(wind[idx], (int, float)) else None,
            })
        if not hourly:
            hourly = default_hours
        hot_hours = [h["hour"] for h in hourly if isinstance(h.get("tempC"), (int, float)) and h["tempC"] >= 32]
        best_window = "morning" if hot_hours and min(hot_hours) <= 15 else "afternoon"
        return {"city": city, "latitude": coord["lat"], "longitude": coord["lng"], "hourly": hourly, "summary": {"bestWindow": best_window, "hotHours": hot_hours}}
    except Exception:
        return {"city": city, "latitude": coord["lat"], "longitude": coord["lng"], "hourly": default_hours, "summary": {"bestWindow": "afternoon", "hotHours": []}}


def _parse_hhmm(value: Optional[str], default_minutes: int) -> int:
    try:
        if not value:
            return default_minutes
        hh, mm = str(value).split(":")[:2]
        return max(0, min(23 * 60 + 59, int(hh) * 60 + int(mm)))
    except Exception:
        return default_minutes


def _format_hhmm(total_minutes: int) -> str:
    mins = ((int(total_minutes) % (24 * 60)) + 24 * 60) % (24 * 60)
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _format_12h(total_minutes: int) -> str:
    mins = ((int(total_minutes) % (24 * 60)) + 24 * 60) % (24 * 60)
    hour_24 = mins // 60
    minute = mins % 60
    suffix = "PM" if hour_24 >= 12 else "AM"
    hour_12 = hour_24 % 12 or 12
    return f"{hour_12:02d}:{minute:02d} {suffix}"


def _category_profile(category: str, place_type: str) -> Dict[str, Any]:
    text = f"{category} {place_type}".lower()
    if any(token in text for token in ["restaurant", "food", "cafe", "dining"]):
        return {"kind": "meal", "preferred": [8, 12, 16, 19], "outdoor": False}
    if any(token in text for token in ["market", "shopping", "bazaar"]):
        return {"kind": "market", "preferred": [10, 17, 18], "outdoor": True}
    if any(token in text for token in ["heritage", "temple", "outdoor", "park", "nature", "view", "walk"]):
        return {"kind": "outdoor", "preferred": [8, 9, 17, 18], "outdoor": True}
    if any(token in text for token in ["museum", "gallery", "indoor", "cultural", "culture", "shopping"]):
        return {"kind": "indoor", "preferred": [13, 14, 15], "outdoor": False}
    return {"kind": "general", "preferred": [10, 14, 17], "outdoor": False}


def _weather_score(hour_info: Dict[str, Any], profile: Dict[str, Any]) -> float:
    temp = hour_info.get("tempC")
    condition = str(hour_info.get("condition") or "").lower()
    hour = int(hour_info.get("hour") or 0)
    score = 0.0
    preferred = profile.get("preferred") or []
    if hour in preferred:
        score += 3
    elif any(abs(hour - p) <= 1 for p in preferred):
        score += 1.5
    if profile.get("outdoor"):
        if isinstance(temp, (int, float)):
            if temp >= 34:
                score -= 4
            elif temp >= 31:
                score -= 2.5
            elif temp <= 21:
                score += 0.5
        if any(token in condition for token in ["rain", "storm", "shower"]):
            score -= 3
    else:
        if isinstance(temp, (int, float)) and temp >= 34:
            score += 0.5
    if profile.get("kind") == "meal" and hour in {8, 9, 12, 13, 16, 19, 20}:
        score += 2.5
    return score


def _select_restaurant_name(restaurants: List[Dict[str, Any]], override: Optional[str], meal_type: str) -> Optional[str]:
    if override:
        return override
    if restaurants:
        return restaurants[0].get("name")
    return None


def _build_meal_card(meal_type: str, restaurant: Optional[str], note: str, start_minutes: int, skip: bool = False) -> Dict[str, Any]:
    end_minutes = start_minutes + (45 if meal_type != "dinner" else 60)
    return {
        "id": f"meal-{meal_type}-{uuid4().hex[:8]}",
        "kind": "meal",
        "mealType": meal_type,
        "title": meal_type.title(),
        "category": "Meal",
        "placeName": restaurant or ("Skipped" if skip else "Choose a restaurant"),
        "note": note,
        "durationMinutes": 45 if meal_type != "dinner" else 60,
        "time": _format_12h(start_minutes),
        "timeSlot": f"{_format_hhmm(start_minutes)} - {_format_hhmm(end_minutes)}",
        "timeRangeLabel": f"{_format_12h(start_minutes)} - {_format_12h(end_minutes)}",
        "bestTimeLabel": "Meal time",
        "weatherLabel": "Recommended based on weather",
        "status": "planned",
        "skipped": skip,
    }


def _build_timeline_entry(place: Dict[str, Any], start_minutes: int, duration_minutes: int, weather_hour: Dict[str, Any], rationale: str, day_number: int = 1) -> Dict[str, Any]:
    end_minutes = start_minutes + duration_minutes
    return {
        "id": place.get("id") or f"tl-{uuid4().hex[:8]}",
        "kind": "place",
        "title": place.get("name") or "Planned stop",
        "placeName": place.get("name") or "Planned stop",
        "category": place.get("category") or "Experience",
        "location": place.get("address") or place.get("vicinity") or place.get("city") or "Nearby",
        "description": rationale,
        "durationMinutes": duration_minutes,
        "time": _format_12h(start_minutes),
        "timeSlot": f"{_format_hhmm(start_minutes)} - {_format_hhmm(end_minutes)}",
        "timeRangeLabel": f"{_format_12h(start_minutes)} - { _format_12h(end_minutes) }",
        "dayNumber": day_number,
        "status": "planned",
        "weather": {
            "tempC": weather_hour.get("tempC"),
            "condition": weather_hour.get("condition"),
            "hour": weather_hour.get("hour"),
        },
        "weatherLabel": "Optimized for weather",
        "bestTimeLabel": "Best time to visit",
        "rationale": rationale,
        "lat": place.get("lat"),
        "lng": place.get("lng"),
        "openingHours": place.get("openingHours"),
        "priceLevel": place.get("priceLevel"),
        "photoUrl": place.get("photoUrl"),
        "placeId": place.get("placeId"),
    }


@app.post("/api/optimize-itinerary")
async def generate_timeline(payload: Dict[str, Any], request: Request):
    """Generate a weather-aware, meal-aware timeline from Curate selections."""
    try:
        city = normalize_query(payload.get("city") or "") or "Kyoto"
        travel_window = payload.get("travelWindow") or {}
        start_minutes = _parse_hhmm(travel_window.get("from") or payload.get("dayStart") or "08:00", 8 * 60)
        end_minutes = _parse_hhmm(travel_window.get("to") or payload.get("dayEnd") or "20:00", 20 * 60)
        if end_minutes <= start_minutes:
            end_minutes = start_minutes + 12 * 60

        plan = payload.get("plan") or {}
        preferences = payload.get("preferences") or {}
        raw_items = payload.get("items") or []
        selected_meals = payload.get("selectedMeals") or {}
        meal_flags = payload.get("mealPlan") or {"breakfast": True, "lunch": True, "snacks": True, "dinner": True}

        coords = await resolve_coords(city, plan.get("locationPref") or {})
        if not coords:
            coords = {"lat": 12.9716, "lon": 77.5946}

        weather = await fetch_weather_context(city, coords.get("lat"), coords.get("lon"), start_hour=max(6, start_minutes // 60), end_hour=min(22, math.ceil(end_minutes / 60)))
        weather_hourly = weather.get("hourly") or []

        async def _resolve_item(item: Dict[str, Any]) -> Dict[str, Any]:
            title = normalize_query(str(item.get("title") or item.get("name") or ""))
            category = normalize_query(str(item.get("category") or item.get("type") or "Experience"))
            if not title:
                return {}
            lat = item.get("lat")
            lng = item.get("lng")
            found = None
            if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                found = {
                    "name": title,
                    "category": category,
                    "lat": float(lat),
                    "lng": float(lng),
                    "address": item.get("location") or city,
                    "placeId": item.get("placeId"),
                    "photoUrl": item.get("photoUrl"),
                    "openingHours": item.get("openingHours"),
                }
            else:
                hits = await search_google_places(title, coords, city, limit=1)
                if hits:
                    found = hits[0]
            if not found:
                found = {
                    "name": title,
                    "category": category,
                    "address": item.get("location") or city,
                    "lat": None,
                    "lng": None,
                    "photoUrl": None,
                    "openingHours": None,
                }
            found["durationMinutes"] = int(item.get("durationMinutes") or item.get("duration_minutes") or 60)
            found["type"] = str(item.get("type") or item.get("placeType") or category).lower()
            found["originalCategory"] = category
            found["preferredWindow"] = _category_profile(category, found.get("type") or category)
            found["raw"] = item
            return found

        enriched_items = [item for item in await asyncio.gather(*[_resolve_item(item) for item in raw_items]) if item.get("name")]

        curated_restaurants = [item for item in enriched_items if any(token in f"{item.get('type')} {item.get('category')}".lower() for token in ["restaurant", "cafe", "food", "dining"])]
        restaurant_pool = curated_restaurants[:8]

        meal_order = ["breakfast", "lunch", "snacks", "dinner"]
        meal_windows = {
            "breakfast": 8 * 60 + 15,
            "lunch": 12 * 60 + 30,
            "snacks": 16 * 60 + 15,
            "dinner": 19 * 60,
        }

        schedule_pool = []
        used_titles: Set[str] = set()
        cursor = start_minutes
        timeline: List[Dict[str, Any]] = []
        meal_options = {
            "breakfast": curated_restaurants[:3],
            "lunch": curated_restaurants[:5],
            "snacks": curated_restaurants[:3],
            "dinner": curated_restaurants[:5],
        }

        # Meal cards are inserted around canonical meal hours and can be skipped by the user.
        for meal_type in meal_order:
            if not meal_flags.get(meal_type, True):
                continue
            override = selected_meals.get(meal_type)
            restaurant_name = _select_restaurant_name(meal_options.get(meal_type, []), override, meal_type)
            note = "Recommended based on weather and travel rhythm."
            timeline.append(_build_meal_card(meal_type, restaurant_name, note, meal_windows[meal_type], skip=not bool(restaurant_name) and bool(selected_meals.get(meal_type) == "skip")))

        # Sort places by weather suitability, then by proximity if available.
        def sort_key(place: Dict[str, Any]) -> Tuple[float, float]:
            profile = place.get("preferredWindow") or {}
            preferred = profile.get("preferred") or [12]
            weather_best = min(
                (_weather_score(hour, profile), hour.get("hour", 12))
                for hour in weather_hourly
            ) if weather_hourly else (0.0, preferred[0])
            lat = place.get("lat") or coords["lat"]
            lng = place.get("lng") or coords["lon"]
            dist = abs(float(lat) - coords["lat"]) + abs(float(lng) - coords["lon"])
            return (-weather_best[0], dist)

        ordered_items = sorted(enriched_items, key=sort_key)
        available_hours = list(range(start_minutes, end_minutes - 29, 30))
        meal_hours = {meal_windows[m] for m in meal_order if meal_flags.get(m, True)}
        used_slots: Set[int] = set()

        def pick_hour(place: Dict[str, Any], minimum_cursor: int) -> int:
            profile = place.get("preferredWindow") or {}
            best_hour = minimum_cursor
            best_score = -999.0
            for hour_info in weather_hourly:
                slot = hour_info.get("hour") * 60
                if slot < minimum_cursor:
                    continue
                if slot in used_slots:
                    continue
                score = _weather_score(hour_info, profile)
                score -= abs(slot - minimum_cursor) / 90
                if any(abs(slot - meal_slot) <= 45 for meal_slot in meal_hours):
                    score += 0.5
                if score > best_score:
                    best_score = score
                    best_hour = slot
            if best_hour < minimum_cursor:
                best_hour = minimum_cursor
            # Snap to 30 minute grid.
            return int(math.ceil(best_hour / 30.0) * 30)

        place_entries: List[Dict[str, Any]] = []
        for place in ordered_items:
            title_key = place.get("name", "").lower()
            if title_key in used_titles:
                continue
            used_titles.add(title_key)
            duration = max(30, int(place.get("durationMinutes") or 60))
            best_start = pick_hour(place, cursor)
            best_start = max(best_start, cursor)
            if best_start + duration > end_minutes:
                best_start = max(cursor, end_minutes - duration)
            weather_hour = next((h for h in weather_hourly if int(h.get("hour", 0)) == best_start // 60), weather_hourly[0] if weather_hourly else {"hour": best_start // 60, "tempC": None, "condition": "clear"})
            profile = place.get("preferredWindow") or {}
            reason_bits = ["Optimized for weather"]
            if profile.get("outdoor") and isinstance(weather_hour.get("tempC"), (int, float)) and weather_hour.get("tempC") >= 32:
                reason_bits.append("avoiding peak heat")
            if profile.get("kind") in {"market", "meal"}:
                reason_bits.append("best crowd timing")
            if profile.get("kind") == "indoor":
                reason_bits.append("balanced for afternoon comfort")
            rationale = "; ".join(reason_bits).capitalize() + "."
            place_entries.append(_build_timeline_entry(place, best_start, duration, weather_hour, rationale, 1))
            cursor = best_start + duration + 15
            used_slots.add(best_start)

        # Merge meals and places by time, keeping meals near canonical windows.
        merged: List[Dict[str, Any]] = []
        place_iter = iter(place_entries)
        meal_queue = [entry for entry in timeline if entry.get("kind") == "meal"]
        for meal in meal_queue:
            merged.append(meal)
        merged.extend(place_entries)
        merged.sort(key=lambda item: item.get("timeSlot") or item.get("time") or "99:99")

        # Re-index and infer smart labels.
        for index, entry in enumerate(merged):
            entry["id"] = entry.get("id") or f"timeline-{index}"
            entry["status"] = "current" if index == 0 else "upcoming"
            entry["order"] = index
            if entry.get("kind") == "meal":
                meal_type = entry.get("mealType") or "meal"
                entry["bestTimeLabel"] = f"{meal_type.title()} time"
                entry["weatherLabel"] = "Recommended based on weather"
            else:
                hour = entry.get("weather", {}).get("hour")
                temp = entry.get("weather", {}).get("tempC")
                entry["weatherLabel"] = f"{temp}°C" if isinstance(temp, (int, float)) else "Weather-aware"
                if isinstance(hour, int) and hour in {8, 9, 17, 18, 19}:
                    entry["bestTimeLabel"] = "Best time to visit"
                else:
                    entry["bestTimeLabel"] = "Recommended based on weather"

        analysis = ""
        if GEMINI_API_KEY and merged:
            prompt = [
                f"You are a travel planner creating short scheduling reasoning for {city}.",
                f"Weather summary: {json.dumps(weather.get('summary') or {})}",
                f"Timeline: {json.dumps([{ 'title': item.get('title'), 'timeSlot': item.get('timeSlot'), 'kind': item.get('kind'), 'category': item.get('category') } for item in merged])}",
                "Return JSON with keys: analysis (short paragraph), tips (array of up to 3 short strings).",
            ]
            ai = await call_gemini_json("\n".join(prompt))
            if isinstance(ai, dict):
                analysis = str(ai.get("analysis") or ai.get("summary") or "")
                if ai.get("tips") and isinstance(ai.get("tips"), list):
                    for tip in ai.get("tips")[:3]:
                        if isinstance(tip, str) and tip.strip():
                            merged.append({
                                "id": f"tip-{uuid4().hex[:8]}",
                                "kind": "insight",
                                "title": tip.strip(),
                                "category": "Insight",
                                "description": tip.strip(),
                                "status": "upcoming",
                            })

        if not analysis:
            analysis = "Weather, meal windows, and outdoor comfort were used to place the most exposed stops earlier in the day and restaurant breaks around canonical meal slots."

        return {
            "city": city,
            "weatherData": weather,
            "mealOptions": {
                meal: [
                    {
                        "name": place.get("name"),
                        "category": place.get("category") or "Restaurant",
                        "address": place.get("address") or place.get("vicinity") or city,
                        "lat": place.get("lat"),
                        "lng": place.get("lng"),
                        "type": place.get("type"),
                    }
                    for place in options[:6]
                ]
                for meal, options in meal_options.items()
            },
            "timeline": merged,
            "analysis": analysis,
            "summary": {
                "weatherOptimized": True,
                "bestWindow": weather.get("summary", {}).get("bestWindow"),
                "crowdTiming": "Best crowd timing",
                "mealCount": len([entry for entry in merged if entry.get("kind") == "meal"]),
                "placeCount": len([entry for entry in merged if entry.get("kind") == "place"]),
            },
            "selectedMeals": selected_meals,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("timeline generation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate timeline")


async def search_place_verified(query: str, ai_result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Verify and match place using free Photon API."""
    if not query:
        return None
    
    norm_query = sanitize_place_query(query)
    if not norm_query:
        return None
    
    # Use Photon API instead of Google Places (free, no key needed)
    url = "https://photon.komoot.io/api"
    params = {
        "q": norm_query,
        "limit": 10,
        "lang": "en",
    }
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, params=params)
        if res.is_error:
            return None
        data = res.json()
    except Exception:
        return None
    
    features = data.get("features", []) if isinstance(data, dict) else []
    if not isinstance(features, list) or not features:
        return None

    # Find best match using AI result
    ai_name = normalize_query(ai_result.get("place_name") or "")
    best = None
    best_score = 0.0
    
    for idx, feature in enumerate(features):
        props = feature.get("properties", {})
        feature_name = normalize_query(props.get("name") or "")
        
        if not feature_name:
            continue
        
        score = SequenceMatcher(None, ai_name.lower(), feature_name.lower()).ratio() if ai_name and feature_name else 0
        if score > best_score:
            best_score = score
            best = (feature, idx)

    if best and best_score >= 0.6:
        feature, idx = best
        mapped = map_photon_to_card(feature, idx, "general")
        if mapped:
            mapped["reasoning"] = f"Verified via Photon/OSM (match {best_score:.2f})"
            mapped["source"] = "reel"
            return mapped

    return None


async def fallback_parse_places(text: str) -> List[Dict[str, Any]]:
    """Caption-only parser: ignore hashtags, look for capitalized place-like chunks, and verify via Google Places."""
    if not text:
        return []

    # 1) Prefer explicit location lines (e.g., "Location 📍Pizza 4P's ...")
    location_hits: List[Dict[str, Any]] = []
    lines = text.splitlines()
    inferred_place_name = infer_place_name_from_caption(text)
    location_name, location_address = extract_location_block(text)
    for idx, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue
        if "location" in line.lower() or "📍" in line:
            cleaned = line
            cleaned = cleaned.replace("📍", " ")
            for marker in ["Location", "location", "LOCATION", ":", "-"]:
                cleaned = cleaned.replace(marker, " ")
            cleaned = normalize_query(" ".join(cleaned.split()))
            # If the next line looks like an address, append it to improve recall
            if idx + 1 < len(lines):
                nxt = normalize_query(lines[idx + 1])
                if any(ch.isdigit() for ch in nxt) and len(nxt.split()) > 3:
                    cleaned = f"{cleaned} {nxt}"
            if len(cleaned) < 3:
                continue
            location_parts = [normalize_query(part) for part in cleaned.split(",") if normalize_query(part)]
            query_candidates = [cleaned]
            if location_name:
                query_candidates.insert(0, f"{location_name}, {cleaned}" if cleaned else location_name)
                query_candidates.insert(1, location_name)
            if inferred_place_name:
                query_candidates.insert(0, f"{inferred_place_name}, {cleaned}")
                query_candidates.insert(1, inferred_place_name)
            for part in location_parts:
                if part not in query_candidates and len(part) >= 3:
                    query_candidates.append(part)
            if location_parts and len(location_parts) >= 2:
                compact = f"{location_parts[0]} {location_parts[1]}"
                if compact not in query_candidates:
                    query_candidates.append(compact)

            found: Optional[Dict[str, Any]] = None
            for candidate in query_candidates[:5]:
                hits = await search_google_places(candidate, None, None, kind="food-dining", limit=1)
                if hits:
                    found = hits[0]
                    break

            if found:
                found["reasoning"] = "From caption location line"
                found["source"] = "reel"
                must_try = extract_must_try(text)
                if must_try:
                    found["must_try"] = must_try
                location_hits.append(found)
                break

            # If Places has no confident result, still return caption-derived location.
            place_name_hint = location_name or inferred_place_name or (location_parts[0] if location_parts else cleaned)
            city_hint = ""
            if location_parts:
                city_hint = extract_city_from_address(", ".join(location_parts))
            unverified = build_unverified_destination(place_name_hint, location_address or cleaned, city_hint)
            if unverified:
                must_try = extract_must_try(text)
                if must_try:
                    unverified["must_try"] = must_try
                location_hits.append(unverified)
                break
    if location_hits:
        return location_hits

    # Extract capitalized word sequences (2-5 words) from the caption text
    stop_words = {
        "april", "may", "june", "july", "august", "september", "october", "november", "december",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "definitely", "opening", "today", "tomorrow", "yesterday", "weekend", "amazing", "awesome",
    }

    def is_viable_place_candidate(candidate: str) -> bool:
        tokenized = [t for t in re.split(r"\s+", candidate.strip()) if t]
        if not tokenized:
            return False
        if len(tokenized) == 1:
            token = tokenized[0].strip(" ,.!?;:\"'()[]{}")
            if token.lower() in stop_words:
                return False
            # Single-token candidates are noisy; allow only likely branded names.
            if len(token) < 4 or not any(ch.isupper() for ch in token):
                return False
        joined = " ".join(tokenized).lower()
        if joined in stop_words:
            return False
        return True

    words = [w.strip(" ,.!?;:\"'()[]{}") for w in text.replace("\n", " ").split()]
    candidates: List[str] = []
    buf: List[str] = []
    for w in words:
        if w.startswith("#"):
            continue
        if len(w) < 2:
            if buf:
                candidates.append(" ".join(buf))
                buf = []
            continue
        if w[0].isupper():
            buf.append(w)
            if len(buf) >= 5:
                candidates.append(" ".join(buf))
                buf = []
        else:
            if buf:
                candidates.append(" ".join(buf))
                buf = []
    if buf:
        candidates.append(" ".join(buf))

    # Deduplicate and trim
    uniq = []
    seen = set()
    for c in candidates:
        c = c.strip()
        if not c:
            continue
        if not is_viable_place_candidate(c):
            continue
        key = c.lower()
        if key not in seen and len(c.split()) <= 5:
            seen.add(key)
            uniq.append(c)

    # Verify via Google Places; keep only the first that resolves
    confirmed: List[Dict[str, Any]] = []
    for name in uniq:
        hits = await search_google_places(name, None, None, limit=1)
        if hits:
            hit = hits[0]
            hit["reasoning"] = "From caption"
            hit["source"] = "reel"
            must_try = extract_must_try(text)
            if must_try:
                hit["must_try"] = must_try
            confirmed.append(hit)
            break

    # Final safety net: if we have a plausible place token but no Google hit,
    # still return it so the UI can surface a destination instead of failing.
    if not confirmed and uniq:
        fallback = build_unverified_destination(location_name or inferred_place_name or uniq[0], location_address)
        if fallback:
            must_try = extract_must_try(text)
            if must_try:
                fallback["must_try"] = must_try
            confirmed.append(fallback)

    return confirmed


class WeatherHintRequest(BaseModel):
    city: Optional[str] = None
    title: Optional[str] = None
    location: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class FoodSlotRequest(BaseModel):
    name: str
    city: Optional[str] = None
    preferences: Dict[str, Any] = {}


class SnackRequest(BaseModel):
    title: Optional[str] = None
    city: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


def _clean_string_list(values: Any, max_items: int = 20) -> List[str]:
    if not isinstance(values, list):
        return []
    cleaned: List[str] = []
    for item in values:
        if not isinstance(item, str):
            continue
        value = normalize_query(item)
        if not value:
            continue
        cleaned.append(value)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _is_missing_relation_error(response: httpx.Response, relation_name: str) -> bool:
    text = (response.text or "").lower()
    if relation_name.lower() in text and ("does not exist" in text or "42p01" in text):
        return True
    try:
        payload = response.json()
        if isinstance(payload, dict):
            details = str(payload.get("details") or "").lower()
            message = str(payload.get("message") or "").lower()
            code = str(payload.get("code") or "").lower()
            blob = " ".join([details, message, code])
            return relation_name.lower() in blob and ("does not exist" in blob or "42p01" in blob)
    except Exception:
        return False
    return False


@app.get("/api/seven-pillars")
async def get_seven_pillars(request: Request):
    user_id = await get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    url = f"{SUPABASE_URL}/rest/v1/triparc_seven_pillars?user_id=eq.{quote(user_id)}&select=*"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            res = await client.get(url, headers=headers)
        if res.is_error:
            if res.status_code == 404:
                logger.warning("triparc_seven_pillars endpoint returned 404; returning empty profile")
                return {"data": None, "warning": "missing_table"}
            # If migration is not applied yet, keep page functional and return empty profile.
            if _is_missing_relation_error(res, "triparc_seven_pillars"):
                logger.warning("triparc_seven_pillars table missing; returning empty profile")
                return {"data": None, "warning": "missing_table"}
            logger.warning(
                "triparc_seven_pillars load failed upstream: status=%s body=%s",
                res.status_code,
                (res.text or "")[:300],
            )
            return {
                "data": None,
                "warning": "upstream_error",
                "upstream_status": res.status_code,
            }
        rows = res.json() if res.content else []
        record = rows[0] if isinstance(rows, list) and rows else None
        return {"data": record}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("failed to fetch seven pillars profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load seven pillars profile")


@app.put("/api/seven-pillars")
async def save_seven_pillars(payload: Dict[str, Any], request: Request):
    user_id = await get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    auth_header = request.headers.get("authorization", "").strip()
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    user_token = auth_header[7:]

    destinations = payload.get("destinations") if isinstance(payload.get("destinations"), list) else []
    safe_destinations: List[Dict[str, str]] = []
    for item in destinations[:12]:
        if not isinstance(item, dict):
            continue
        location = normalize_query(str(item.get("location") or ""))
        travel_from = normalize_query(str(item.get("travelFrom") or ""))
        travel_to = normalize_query(str(item.get("travelTo") or ""))
        if not location:
            continue
        safe_destinations.append(
            {
                "location": location,
                "travelFrom": travel_from,
                "travelTo": travel_to,
            }
        )

    dietary = payload.get("dietary") if isinstance(payload.get("dietary"), dict) else {}
    budget_amount = int(payload.get("budgetAmount") or 42500)
    budget_tier = normalize_query(str(payload.get("budgetTier") or "comfortable")).lower()
    selected_archetypes = _clean_string_list(payload.get("archetypes"), max_items=3)
    if budget_amount > 50000:
        selected_archetypes = [item for item in selected_archetypes if item != "budget backpacker"]

    day_start = normalize_query(str(payload.get("dayStart") or "08:00"))
    day_end = normalize_query(str(payload.get("dayEnd") or "21:00"))

    def _parse_hhmm(value: str) -> Optional[int]:
        try:
            hh, mm = value.split(":", 1)
            hour = int(hh)
            minute = int(mm)
            if hour < 0 or hour > 23 or minute < 0 or minute > 59:
                return None
            return hour * 60 + minute
        except Exception:
            return None

    start_minutes = _parse_hhmm(day_start)
    end_minutes = _parse_hhmm(day_end)
    day_cycle_hours: Optional[float] = None
    if start_minutes is not None and end_minutes is not None:
        diff = end_minutes - start_minutes
        if diff < 0:
            diff += 24 * 60
        day_cycle_hours = round(diff / 60.0, 1)
    record = {
        "user_id": user_id,
        "engine_version": normalize_query(str(payload.get("engineVersion") or "2.0")) or "2.0",
        "destination_network": {
            "mode": "multiple" if len(safe_destinations) > 1 else "single",
            "count": len(safe_destinations),
            "destinations": safe_destinations,
        },
        "active_day_cycle": {
            "start": day_start,
            "end": day_end,
            "hours": day_cycle_hours,
        },
        "investment_scope": {
            "tier": budget_tier,
            "amount": budget_amount,
        },
        "expedition_archetypes": selected_archetypes,
        "group_composition": normalize_query(str(payload.get("composition") or "couple")).lower(),
        "dietary_preferences": {
            "preferences": _clean_string_list(dietary.get("preferences"), max_items=8),
            "allergies": normalize_query(str(dietary.get("allergies") or "")),
        },
        "special_interests": _clean_string_list(payload.get("interests"), max_items=12),
        "raw_payload": payload,
    }

    url = f"{SUPABASE_URL}/rest/v1/triparc_seven_pillars?on_conflict=user_id"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {user_token}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(url, headers=headers, json=[record])
        if res.is_error:
            if res.status_code == 404:
                raise HTTPException(
                    status_code=503,
                    detail="Seven Pillars table is missing. Run supabase_update_7pillars.sql in Supabase SQL Editor.",
                )
            if _is_missing_relation_error(res, "triparc_seven_pillars"):
                raise HTTPException(
                    status_code=503,
                    detail="Seven Pillars table is missing. Run supabase_update_7pillars.sql in Supabase SQL Editor.",
                )
            raise HTTPException(status_code=502, detail=f"Could not save seven pillars profile: {res.text}")
        rows = res.json() if res.content else []
        saved = rows[0] if isinstance(rows, list) and rows else record
        return {"ok": True, "data": saved}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("failed to save seven pillars profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save seven pillars profile")


@app.get("/api/search-place")
async def search_place(query: str, city: Optional[str] = None, limit: int = 6):
    q = sanitize_place_query(query)
    c = normalize_query(city or "")
    if not q or len(q) < 2:
        return {"results": []}

    inferred_city = c or infer_city_from_text(q)
    effective_limit = max(1, min(limit, 20))

    # Try the most specific query first, then broader fallbacks.
    query_variants: List[str] = []
    for candidate in [
        f"{q} {inferred_city}".strip(),
        f"{q} {c}".strip(),
        q,
        inferred_city,
    ]:
        candidate = normalize_query(candidate)
        if candidate and candidate.lower() not in {existing.lower() for existing in query_variants}:
            query_variants.append(candidate)

    # For very short or ambiguous queries, probe a few common landmark forms too.
    if len(q.split()) <= 2 and not inferred_city and not c:
        for suffix in ["Botanical Garden", "Botanical Gardens", "Park", "Temple", "Museum"]:
            candidate = normalize_query(f"{q} {suffix}")
            if candidate and candidate.lower() not in {existing.lower() for existing in query_variants}:
                query_variants.append(candidate)

    def place_score(place: Dict[str, Any]) -> tuple[int, int, int, str]:
        name = normalize_query(str(place.get("name") or ""))
        vicinity = normalize_query(str(place.get("vicinity") or ""))
        combined = f"{name} {vicinity}".lower()
        q_lower = q.lower()
        city_lower = inferred_city.lower() if inferred_city else c.lower()
        types = [str(t).lower() for t in (place.get("types") or []) if str(t).strip()]
        category = str(place.get("category") or "").lower()
        exact = 0
        if combined == q_lower:
            exact = 3
        elif combined.startswith(q_lower):
            exact = 2
        elif q_lower in combined:
            exact = 1
        city_bonus = 1 if city_lower and city_lower in combined else 0
        landmark_bonus = 0
        if category in {"attraction", "food-dining"}:
            landmark_bonus += 1
        if any(t in {"park", "tourism", "museum", "attraction", "restaurant", "cafe", "historic", "monument"} for t in types):
            landmark_bonus += 2
        if any(token in combined for token in {"botanical", "garden", "gardens", "park", "museum", "temple", "fort", "lake", "palace", "sanctuary"}):
            landmark_bonus += 2
        locality_penalty = 1 if any(t in {"village", "suburb", "administrative", "hamlet", "residential"} for t in types) else 0
        length_penalty = len(name)
        return (-exact, -city_bonus, -landmark_bonus, locality_penalty, length_penalty, name.lower())

    seen_keys: Set[str] = set()
    collected: List[Dict[str, Any]] = []

    for candidate in query_variants:
        hits = await search_photon_places(candidate, None, inferred_city or c or None, kind="general", limit=effective_limit)
        for hit in hits:
            key = str(hit.get("placeId") or hit.get("name") or "").lower()
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            collected.append(hit)

    if not collected:
        return {"results": []}

    collected.sort(key=place_score)

    results: List[Dict[str, Any]] = []
    for idx, hit in enumerate(collected[:effective_limit]):
        results.append({
            "label": hit.get("name") or hit.get("address") or "Place",
            "name": hit.get("name") or "Place",
            "vicinity": hit.get("vicinity") or hit.get("address") or "",
            "lat": hit.get("lat"),
            "lng": hit.get("lng"),
            "placeId": hit.get("placeId") or f"photon-{idx}",
            "types": hit.get("types") or [],
            "category": hit.get("category"),
            "maps_link": hit.get("maps_link"),
            "photoUrl": hit.get("photoUrl"),
        })

    return {"results": results}


@app.get("/api/verify-place")
async def place_details(query: str, city: Optional[str] = None):
    """Get detailed information about a place including estimated visit duration."""
    try:
        q = normalize_query(query)
        c = normalize_query(city or "")
        if not q or len(q) < 2:
            raise HTTPException(status_code=400, detail="query is required")
        
        # Search for the place first
        hits = await search_google_places(q, None, c or None, kind="general", limit=1)
        if not hits:
            raise HTTPException(status_code=404, detail="Place not found")
        
        place = hits[0]
        place_name = place.get("name", q)
        place_category = place.get("category", "Attraction")
        
        # Estimate duration based on category using Gemini
        duration_prompt = f"""Based on the place type, estimate how long a typical visitor spends at '{place_name}' (category: {place_category}) in a city setting. 
Consider the type of experience and typical visit duration.
Return a JSON object with:
- estimatedDurationMinutes: number (typical visit duration in minutes, e.g., 45, 90, 120)
- bestTimeToVisit: string (morning, afternoon, evening, or any time)
- crowdLevel: string (low, medium, or high)

Format as JSON only, no markdown."""

        duration_data = await call_gemini_json(duration_prompt)
        if not duration_data:
            # Fallback based on category
            category_lower = place_category.lower()
            if "restaurant" in category_lower or "food" in category_lower:
                est_minutes = 75
            elif "museum" in category_lower or "gallery" in category_lower:
                est_minutes = 120
            elif "park" in category_lower or "garden" in category_lower:
                est_minutes = 90
            elif "temple" in category_lower or "mosque" in category_lower or "church" in category_lower:
                est_minutes = 45
            elif "market" in category_lower or "bazaar" in category_lower:
                est_minutes = 60
            elif "palace" in category_lower or "fort" in category_lower or "heritage" in category_lower:
                est_minutes = 120
            else:
                est_minutes = 60
            
            duration_data = {
                "estimatedDurationMinutes": est_minutes,
                "bestTimeToVisit": "afternoon",
                "crowdLevel": "medium",
            }
        
        return {
            "details": {
                "name": place_name,
                "category": place_category,
                "estimatedDurationMinutes": duration_data.get("estimatedDurationMinutes", 60),
                "bestTimeToVisit": duration_data.get("bestTimeToVisit", "anytime"),
                "crowdLevel": duration_data.get("crowdLevel", "medium"),
                "image": place.get("image"),
                "address": place.get("address") or place.get("vicinity"),
                "openingHours": place.get("openingHours"),
                "rating": place.get("rating"),
                "reviews": place.get("reviews"),
                "lat": place.get("lat"),
                "lng": place.get("lng"),
            }
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("place details failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch place details")


def map_otm_kind(category: str) -> str:
    category = category.lower()
    if any(k in category for k in ["heritage", "historic", "history"]): return "cultural,historic"
    if any(k in category for k in ["food", "restaurant", "cafe", "dining", "dessert"]): return "foods"
    if any(k in category for k in ["instagrammable", "photography", "viewpoint"]): return "viewpoints,architecture"
    if any(k in category for k in ["nature", "park"]): return "natural"
    if any(k in category for k in ["local experience", "interesting"]): return "interesting_places"
    if any(k in category for k in ["hidden gems"]): return "interesting_places,cultural"
    if any(k in category for k in ["museum"]): return "museums"
    return "interesting_places"

@app.post("/api/discover-city")
async def discover_city(payload: Dict[str, Any], request: Request):
    try:
        user_id = await get_user_id(request)
        city = payload.get("city", "").strip()
        destinations = payload.get("destinations") or [city]
        if city and city not in destinations:
            destinations = [city] + destinations
            
        if not destinations or not any(d.strip() for d in destinations):
            raise HTTPException(status_code=400, detail="At least one destination is required")
            
        interests = [str(x).strip() for x in (payload.get("interests") or []) if str(x).strip()]
        archetypes = [str(x).strip() for x in (payload.get("archetypes") or []) if str(x).strip()]
        exclude_names = {normalize_query(str(x)).lower() for x in (payload.get("excludeNames") or []) if normalize_query(str(x))}
        
        all_recommendations = []
        
        for destination in destinations:
            dest = destination.strip()
            if not dest: continue
            
            coords = await resolve_coords(dest, {})
            if not coords: continue
            
            # Map interests to OpenTripMap kinds
            otm_kinds = set()
            for interest in interests:
                otm_kinds.update(map_otm_kind(interest).split(","))
            if not otm_kinds:
                otm_kinds = {"interesting_places", "cultural"}
                
            kinds_str = ",".join(otm_kinds)
            
            # Fetch from OpenTripMap
            otm_places = await fetch_nearby(coords["lat"], coords["lon"], OPENTRIPMAP_API_KEY)
            
            seen: Set[str] = set()
            for place in otm_places:
                place_name_norm = normalize_query(str(place.get("name") or "")).lower()
                if not place_name_norm or place_name_norm in exclude_names or place_name_norm in seen:
                    continue
                seen.add(place_name_norm)
                
                category = "Attraction"
                if "foods" in str(place.get("kinds", "")): category = "Food"
                elif "historic" in str(place.get("kinds", "")): category = "Heritage"
                elif "natural" in str(place.get("kinds", "")): category = "Nature"
                elif "museums" in str(place.get("kinds", "")): category = "Museum"
                
                all_recommendations.append({
                    "id": f"rec-{len(all_recommendations)}-{int(time.time())}",
                    "destination": dest,
                    "name": place.get("name") or "Recommended stop",
                    "address": dest,
                    "category": category,
                    "why": _build_why_text(category, interests, archetypes),
                    "estimatedMinutes": _estimate_visit_minutes(category),
                    "bestTime": "anytime",
                    "crowdLevel": "medium",
                    "image": place.get("image") or place.get("photoUrl"), # OTM doesn't provide image easily, but keep struct
                    "lat": place.get("lat") or coords["lat"],
                    "lng": place.get("lng") or coords["lon"],
                    "archetypeMatch": archetypes,
                })
                
                if len(all_recommendations) >= 20:
                    break
            
            if len(all_recommendations) >= 20:
                break
                
        if user_id and all_recommendations:
            await save_user_recommendations(user_id, {
                "destinations": destinations,
                "interests": interests,
                "archetypes": archetypes,
                "recommendations": all_recommendations,
                "createdAt": datetime.now().isoformat(),
            })
            
        return {"recommendations": all_recommendations}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("discover city failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate recommendations")

@app.post("/api/nearby-recommendations")
async def nearby_recommendations(payload: Dict[str, Any], request: Request):
    try:
        latest_anchor_place = payload.get("latestAnchorPlace")
        if not latest_anchor_place or not isinstance(latest_anchor_place.get("lat"), (int, float)) or not isinstance(latest_anchor_place.get("lng"), (int, float)):
            return {"recommendations": []}
            
        anchor_lat = latest_anchor_place["lat"]
        anchor_lng = latest_anchor_place["lng"]
        anchor_category = str(latest_anchor_place.get("category") or "").lower()
        exclude_names = {normalize_query(str(x)).lower() for x in (payload.get("excludeNames") or []) if normalize_query(str(x))}
        
        otm_kinds = set()
        if any(k in anchor_category for k in ["restaurant", "food", "cafe", "dining"]):
            otm_kinds.update(["foods", "cultural"])
        elif any(k in anchor_category for k in ["monument", "heritage", "history", "museum"]):
            otm_kinds.update(["viewpoints", "museums", "foods"])
        elif any(k in anchor_category for k in ["market", "shopping"]):
            otm_kinds.update(["foods", "interesting_places"])
        else:
            otm_kinds.update(["interesting_places", "foods", "cultural"])
            
        kinds_str = ",".join(otm_kinds)
        
        # Use OpenTripMap with a smaller radius (e.g. 3000m)
        api_key = OPENTRIPMAP_API_KEY
        if not api_key: return {"recommendations": []}
        
        url = f"https://api.opentripmap.com/0.1/en/places/radius?lat={anchor_lat}&lon={anchor_lng}&radius=3000&limit=5&kinds={kinds_str}&format=json&apikey={api_key}"
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url)
            
        nearby = []
        if not res.is_error:
            data = res.json()
            if isinstance(data, list):
                seen: Set[str] = set()
                for place in data:
                    place_name_norm = normalize_query(str(place.get("name") or "")).lower()
                    if not place_name_norm or place_name_norm in exclude_names or place_name_norm in seen:
                        continue
                    seen.add(place_name_norm)
                    
                    category = "Attraction"
                    if "foods" in str(place.get("kinds", "")): category = "Food"
                    elif "historic" in str(place.get("kinds", "")): category = "Heritage"
                    elif "natural" in str(place.get("kinds", "")): category = "Nature"
                    elif "museums" in str(place.get("kinds", "")): category = "Museum"
                    
                    nearby.append({
                        "id": f"rec-nearby-{len(nearby)}-{int(time.time())}",
                        "destination": latest_anchor_place.get("name") or "Your Route",
                        "name": place.get("name") or "Recommended stop",
                        "address": "",
                        "category": category,
                        "why": f"Close to {latest_anchor_place.get('name', 'your last stop')}",
                        "estimatedMinutes": _estimate_visit_minutes(category),
                        "bestTime": "anytime",
                        "crowdLevel": "medium",
                        "lat": place.get("point", {}).get("lat") or anchor_lat,
                        "lng": place.get("point", {}).get("lon") or anchor_lng,
                        "isNearby": True,
                    })
                    if len(nearby) >= 2:
                        break
                        
        return {"recommendations": nearby}
    except Exception as exc:
        logger.warning("nearby recommendations failed: %s", exc)
        return {"recommendations": []}


def _get_archetype_context(archetypes: List[str]) -> str:
    """Get detailed context for each archetype."""
    context_map = {
        "cultural explorer": "Focus on discovering local history, traditions, museums, temples, heritage sites, and cultural experiences.",
        "budget backpacker": "Focus on budget-friendly options, street food, local markets, free/cheap attractions, and authentic local experiences.",
        "spiritual seeker": "Focus on sacred sites, temples, ashrams, meditation centers, yoga studios, and spiritually significant locations.",
        "chill and relax": "Focus on relaxation spots, spas, peaceful parks, cozy cafes, sunset views, and stress-free experiences.",
        "medical excursion": "Focus on wellness centers, ayurvedic clinics, health resorts, and medical tourism facilities.",
        "instagram explorer": "Focus on photogenic locations, trending spots, scenic viewpoints, colorful markets, and Instagram-worthy cafes and installations.",
    }
    
    contexts = []
    for archetype in archetypes[:3]:
        archetype_lower = archetype.lower()
        for key, value in context_map.items():
            if key.lower() in archetype_lower or archetype_lower in key.lower():
                contexts.append(f"  - {value}")
                break
    
    return "\n".join(contexts) if contexts else "Focus on unique and memorable experiences."


def _build_theme_queries(interests: List[str], archetypes: List[str]) -> List[str]:
    archetype_map = {
        "cultural explorer": ["heritage sites", "museums", "historical architecture"],
        "budget backpacker": ["free attractions", "street food", "budget travel spots"],
        "spiritual seeker": ["temples", "meditation center", "spiritual places"],
        "chill and relax": ["peaceful parks", "sunset point", "calm cafes"],
        "medical excursion": ["wellness center", "ayurveda", "healing retreat"],
        "instagram explorer": ["instagrammable places", "scenic viewpoint", "trendy cafes"],
    }

    queries: List[str] = []
    for archetype in archetypes[:3]:
        al = archetype.lower()
        for key, vals in archetype_map.items():
            if key in al or al in key:
                queries.extend(vals)
                break

    queries.extend([i for i in interests[:4] if i])
    queries.extend(["top sights", "hidden gems"])

    unique: List[str] = []
    seen: Set[str] = set()
    for q in queries:
        k = normalize_query(q).lower()
        if not k or k in seen:
            continue
        seen.add(k)
        unique.append(k)
    return unique


def _estimate_visit_minutes(category: str) -> int:
    c = (category or "").lower()
    if "museum" in c or "gallery" in c or "fort" in c or "palace" in c:
        return 120
    if "temple" in c or "church" in c or "mosque" in c or "shrine" in c:
        return 60
    if "park" in c or "garden" in c or "viewpoint" in c:
        return 75
    if "restaurant" in c or "cafe" in c or "food" in c:
        return 60
    return 90


def _build_why_text(category: str, interests: List[str], archetypes: List[str]) -> str:
    interest_text = interests[0] if interests else "your preferences"
    archetype_text = archetypes[0] if archetypes else "your travel style"
    return f"Matches {interest_text} and fits {archetype_text}; category: {category}."


def _estimate_duration_by_type(category: str, place_type: str) -> int:
    text = f"{category} {place_type}".lower()
    if any(token in text for token in ["restaurant", "cafe", "food", "dining"]):
        return 60
    if any(token in text for token in ["museum", "gallery", "heritage", "fort", "palace"]):
        return 120
    if any(token in text for token in ["temple", "mosque", "church", "shrine"]):
        return 75
    if any(token in text for token in ["park", "garden", "view", "viewpoint", "nature", "trail", "walk"]):
        return 80
    if any(token in text for token in ["market", "bazaar", "shopping"]):
        return 90
    return 75


def _crowd_pattern_for_type(category: str, place_type: str) -> Dict[str, List[int]]:
    text = f"{category} {place_type}".lower()
    if any(token in text for token in ["restaurant", "cafe", "food", "dining"]):
        return {"peak": [8, 13, 20], "low": [10, 15, 18]}
    if any(token in text for token in ["museum", "gallery", "heritage", "palace", "fort"]):
        return {"peak": [11, 14, 16], "low": [9, 12, 15]}
    if any(token in text for token in ["temple", "mosque", "church", "shrine"]):
        return {"peak": [6, 9, 17], "low": [10, 14, 19]}
    if any(token in text for token in ["park", "garden", "view", "viewpoint", "nature", "trail", "walk"]):
        return {"peak": [7, 18], "low": [10, 13, 15]}
    if any(token in text for token in ["market", "bazaar", "shopping"]):
        return {"peak": [11, 17, 19], "low": [9, 14]}
    return {"peak": [11, 14, 18], "low": [9, 13, 16]}


def _best_time_slot_for_category(category: str, place_type: str, user_minutes: Optional[int] = None) -> int:
    profile = _category_profile(category, place_type)
    crowd = _crowd_pattern_for_type(category, place_type)
    candidates = sorted(set(profile.get("preferred", []) + crowd.get("low", []) + [8, 10, 12, 14, 16, 18]))
    if not candidates:
        candidates = [10, 13, 16]

    def score(hour: int) -> Tuple[int, int, int]:
        low_bonus = 0 if hour in crowd["low"] else 2 if any(abs(hour - low) <= 1 for low in crowd["low"]) else 5
        peak_penalty = 4 if hour in crowd["peak"] else 1 if any(abs(hour - peak) <= 1 for peak in crowd["peak"]) else 0
        profile_bonus = 0 if hour in profile.get("preferred", []) else 1
        user_distance = abs(hour * 60 - user_minutes) if isinstance(user_minutes, int) else 0
        return (low_bonus + peak_penalty + profile_bonus, user_distance, hour)

    best_hour = min(candidates, key=score)
    return max(0, min(23, best_hour))


def _format_analysis_time(hour: int) -> str:
    hour = max(0, min(23, int(hour)))
    minute = 0
    suffix = "AM" if hour < 12 else "PM"
    hour_12 = hour % 12 or 12
    return f"{hour_12:02d}:{minute:02d} {suffix}"


def _suggestion_for_timing(place: str, best_hour: int, user_time: str, status: str, category: str) -> str:
    if status == "optimal":
        return f"{place} already fits the quietest window for this category."
    crowd = _crowd_pattern_for_type(category, category)
    low_hours = ", ".join(_format_analysis_time(hour) for hour in crowd.get("low", [])[:2])
    return f"Shift {place} closer to { _format_analysis_time(best_hour) } for lower crowds. Low-crowd windows: {low_hours}."


def _parse_clock_minutes(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    text = str(value).strip().upper()
    match = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$", text)
    if not match:
        return None
    hour = int(match.group(1)) % 12 + (12 if match.group(3) == "PM" else 0)
    minute = int(match.group(2))
    return hour * 60 + minute


def _serialize_draft_analysis(place: Dict[str, Any], user_time: str, recommended_hour: int, duration_minutes: int) -> Dict[str, Any]:
    category = str(place.get("category") or place.get("type") or "Experience")
    place_name = str(place.get("name") or place.get("title") or "Planned stop")
    best_time = _format_analysis_time(recommended_hour)
    user_minutes = _parse_clock_minutes(user_time)
    recommended_minutes = recommended_hour * 60
    aligned = user_minutes is not None and abs(user_minutes - recommended_minutes) <= 30
    status = "optimal" if aligned else "not optimal"
    suggestion = _suggestion_for_timing(place_name, recommended_hour, user_time, status, category)
    return {
        "place": place_name,
        "duration": duration_minutes,
        "recommended_time": best_time,
        "user_time": user_time,
        "status": status,
        "suggestion": suggestion,
        "category": category,
        "crowd_pattern": _crowd_pattern_for_type(category, str(place.get("type") or category)),
        "recommended_minutes": recommended_minutes,
        "user_minutes": user_minutes,
    }


def _best_google_place_hit(query: str, hits: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not hits:
        return None
    normalized_query = normalize_query(query).lower()

    def score(hit: Dict[str, Any]) -> float:
        name = normalize_query(str(hit.get("name") or "")).lower()
        address = normalize_query(str(hit.get("address") or hit.get("vicinity") or "")).lower()
        rating = hit.get("rating")
        ratios = [SequenceMatcher(None, normalized_query, candidate).ratio() for candidate in [name, address] if candidate]
        base = max(ratios) if ratios else 0.0
        if normalized_query and (normalized_query in name or normalized_query in address):
            base += 0.25
        if isinstance(rating, (int, float)):
            base += min(0.2, float(rating) / 25.0)
        return base

    return max(hits, key=score)


def _time_label_from_minutes(total_minutes: int) -> str:
    return _format_12h(max(0, total_minutes))


def _build_draft_optimizer_prompt(city: str, travel_window: Dict[str, Any], places: List[Dict[str, Any]]) -> str:
    return "\n".join([
        f"You are optimizing a draft travel itinerary for {city}.",
        "Use Google Places details, place types, opening hours, ratings, reviews snippets, weather, and crowd windows.",
        "Return JSON only with keys: orderedIds, analysis, summary.",
        "orderedIds must preserve every item and sort them in the best visiting order.",
        "analysis must be an array of objects with fields: id, place, duration, recommended_time, user_time, status, suggestion, crowd_window, order.",
        "summary should be a short sentence explaining the final route logic.",
        "Rules:",
        "- Do not drop any item.",
        "- Prefer low-crowd windows and open hours.",
        "- If an item is already in the best window, mark it optimal.",
        "- Keep the final route geographically coherent when possible.",
        f"travelWindow: {json.dumps(travel_window, ensure_ascii=False)}",
        f"places: {json.dumps(places, ensure_ascii=False)}",
    ])


def _compile_optimized_draft_schedule(
    ordered_places: List[Dict[str, Any]],
    start_minutes: int,
    end_minutes: int,
    original_map: Dict[str, Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], bool]:
    cursor = start_minutes
    analysis_rows: List[Dict[str, Any]] = []
    optimized_items: List[Dict[str, Any]] = []
    all_optimal = True

    for index, place in enumerate(ordered_places):
        item_id = str(place.get("id") or f"draft-{index}")
        original = original_map.get(item_id) or place
        duration_minutes = int(place.get("durationMinutes") or original.get("durationMinutes") or 60)
        ideal_hour = int(place.get("preferredHour") or _best_time_slot_for_category(str(place.get("category") or ""), str(place.get("type") or ""), _parse_clock_minutes(str(original.get("userTime") or ""))))
        ideal_minutes = ideal_hour * 60
        start_at = max(cursor, ideal_minutes)
        if start_at + duration_minutes > end_minutes:
            start_at = max(start_minutes, end_minutes - duration_minutes)
        end_at = start_at + duration_minutes
        cursor = min(end_minutes, end_at + 10)

        recommended_time = _time_label_from_minutes(start_at)
        user_time = str(original.get("userTime") or original.get("time") or "")
        user_minutes = _parse_clock_minutes(user_time)
        status = "optimal" if user_minutes is not None and abs(user_minutes - start_at) <= 30 else "not optimal"
        if status != "optimal":
            all_optimal = False

        suggestion = str(place.get("suggestion") or place.get("note") or "")
        if not suggestion:
            suggestion = f"{place.get('name')} fits the current live window." if status == "optimal" else f"Shift {place.get('name')} closer to {recommended_time} for lower crowds."

        analysis_rows.append({
            "id": item_id,
            "place": place.get("name") or place.get("title") or "Planned stop",
            "duration": duration_minutes,
            "recommended_time": recommended_time,
            "user_time": user_time,
            "status": status,
            "suggestion": suggestion,
            "order": index,
            "crowd_window": place.get("crowdPattern") or {},
        })
        optimized_items.append({
            "id": item_id,
            "title": place.get("name") or place.get("title") or "Planned stop",
            "category": place.get("category") or "Experience",
            "time": recommended_time,
            "timeSlot": f"{_format_hhmm(start_at)} - {_format_hhmm(end_at)}",
            "durationMinutes": duration_minutes,
            "duration": duration_minutes if duration_minutes < 60 else f"{round(duration_minutes / 60)} hr",
            "description": suggestion,
            "status": original.get("status") or "upcoming",
            "dayNumber": int(original.get("dayNumber") or 1),
            "requiresNextDay": bool(original.get("requiresNextDay")),
        })

    return analysis_rows, optimized_items, all_optimal


def _draft_place_kind(category: str, place_type: str) -> str:
    text = f"{category} {place_type}".lower()
    if any(token in text for token in ["restaurant", "cafe", "food", "dining", "meal", "dhaba"]):
        return "food"
    if any(token in text for token in ["museum", "gallery", "heritage", "fort", "palace", "history", "art"]):
        return "culture"
    if any(token in text for token in ["temple", "mosque", "church", "shrine", "spiritual"]):
        return "spiritual"
    if any(token in text for token in ["park", "garden", "viewpoint", "nature", "trail", "lake", "walk"]):
        return "nature"
    if any(token in text for token in ["market", "shopping", "bazaar", "mall"]):
        return "shopping"
    return "experience"


def _draft_item_to_place_object(item: Dict[str, Any], city: str, user_time: str, duration_minutes: int) -> Dict[str, Any]:
    category = str(item.get("category") or item.get("type") or "Experience")
    place_type = str(item.get("type") or category).lower()
    return {
        "id": str(item.get("id") or f"draft-{uuid4().hex[:8]}"),
        "name": str(item.get("name") or item.get("title") or "Planned stop"),
        "category": category,
        "type": place_type,
        "userTime": user_time,
        "durationMinutes": duration_minutes,
        "dayNumber": int(item.get("dayNumber") or 1),
        "rating": item.get("rating"),
        "reviewsSnippet": item.get("reviewsSnippet"),
        "address": item.get("address") or item.get("location") or city,
        "openingHours": item.get("openingHours"),
        "crowdPattern": _crowd_pattern_for_type(category, place_type),
        "preferredHour": _best_time_slot_for_category(category, place_type, _parse_clock_minutes(user_time)),
    }


@app.post("/api/curate/draft-itinerary")
async def analyze_draft_itinerary(payload: Dict[str, Any]):
    """Analyze a Curate draft itinerary and return timing guidance plus reordered output."""
    try:
        city = normalize_query(payload.get("city") or "") or "Kyoto"
        travel_window = payload.get("travelWindow") or {}
        start_minutes = _parse_hhmm(travel_window.get("from") or payload.get("dayStart") or "08:00", 8 * 60)
        end_minutes = _parse_hhmm(travel_window.get("to") or payload.get("dayEnd") or "20:00", 20 * 60)
        if end_minutes <= start_minutes:
            end_minutes = start_minutes + 12 * 60

        raw_items = payload.get("items") or []
        plan = payload.get("plan") or {}
        coords = await resolve_coords(city, plan.get("locationPref") or {})
        if not coords:
            coords = {"lat": 12.9716, "lon": 77.5946}

        weather = await fetch_weather_context(city, coords.get("lat"), coords.get("lon"), start_hour=max(6, start_minutes // 60), end_hour=min(22, math.ceil(end_minutes / 60)))
        weather_hourly = weather.get("hourly") or []

        async def _resolve(item: Dict[str, Any]) -> Dict[str, Any]:
            title = normalize_query(str(item.get("title") or item.get("name") or "")).strip()
            if not title:
                return {}
            category = normalize_query(str(item.get("category") or item.get("type") or "Experience"))
            user_time = str(item.get("time") or item.get("timeSlot") or "")
            duration_minutes = int(item.get("durationMinutes") or item.get("baseDurationMinutes") or _estimate_duration_by_type(category, str(item.get("type") or category)))
            resolved: Dict[str, Any] = _draft_item_to_place_object({**item, "title": title, "category": category}, city, user_time, duration_minutes)

            hits = await search_google_places(title, coords, city, kind="general", limit=4)
            best_hit = _best_google_place_hit(title, hits)
            if best_hit:
                resolved.update(best_hit)
                resolved["name"] = best_hit.get("name") or title
                resolved["category"] = normalize_query(str(best_hit.get("category") or category)) or category
                resolved["type"] = str(best_hit.get("type") or best_hit.get("placeType") or item.get("type") or category).lower()
                place_id = best_hit.get("placeId") or best_hit.get("place_id")
                if isinstance(place_id, str) and place_id:
                    context = await fetch_place_context(place_id)
                    if context:
                        resolved.update({k: v for k, v in context.items() if v is not None})
                        resolved["name"] = context.get("name") or resolved["name"]
                        if context.get("types"):
                            resolved["type"] = str((context.get("types") or [resolved.get("type")])[0]).lower()

            place_type = str(resolved.get("type") or resolved.get("category") or category).lower()
            resolved["placeKind"] = _draft_place_kind(str(resolved.get("category") or category), place_type)
            resolved["crowdPattern"] = _crowd_pattern_for_type(str(resolved.get("category") or category), place_type)
            resolved["preferredHour"] = _best_time_slot_for_category(str(resolved.get("category") or category), place_type, _parse_clock_minutes(user_time))
            resolved["preferredTime"] = _time_label_from_minutes(int(resolved["preferredHour"]) * 60)
            resolved["openingHours"] = resolved.get("openingHours")
            resolved["rating"] = resolved.get("rating")
            resolved["userTime"] = user_time
            resolved["durationMinutes"] = duration_minutes
            return resolved

        resolved_items = [item for item in await asyncio.gather(*[_resolve(item) for item in raw_items]) if item.get("name")]

        analyzed: List[Dict[str, Any]] = []
        for item in resolved_items:
            best_hour = _best_time_slot_for_category(str(item.get("category") or ""), str(item.get("type") or ""), _parse_clock_minutes(str(item.get("userTime") or "")))
            analyzed.append(_serialize_draft_analysis(item, str(item.get("userTime") or ""), best_hour, int(item.get("durationMinutes") or 60)))

        gemini_result = None
        if GEMINI_API_KEY:
            optimizer_prompt = _build_draft_optimizer_prompt(city, travel_window, resolved_items)
            gemini_result = await call_gemini_json(optimizer_prompt)

        ordered_places = list(resolved_items)
        if isinstance(gemini_result, dict):
            ordered_ids = [str(item) for item in (gemini_result.get("orderedIds") or []) if str(item).strip()]
            if ordered_ids:
                id_map = {str(place.get("id")): place for place in resolved_items}
                ordered_places = [id_map[item_id] for item_id in ordered_ids if item_id in id_map] + [place for place in resolved_items if str(place.get("id")) not in ordered_ids]
            elif isinstance(gemini_result.get("analysis"), list):
                gemini_analysis = {str(row.get("id") or row.get("place") or ""): row for row in gemini_result.get("analysis") if isinstance(row, dict)}
                ordered_places = sorted(
                    resolved_items,
                    key=lambda place: (
                        int(gemini_analysis.get(str(place.get("id") or place.get("name") or ""), {}).get("order") or 9999),
                        int(place.get("preferredHour") or 99),
                        -float(place.get("rating") or 0),
                        str(place.get("name") or ""),
                    ),
                )

        original_map = {str(item.get("id") or ""): item for item in resolved_items}
        analysis_rows, optimized_items, all_optimal = _compile_optimized_draft_schedule(ordered_places, start_minutes, end_minutes, original_map)

        summary = "Ordered by live crowd timing, place types, opening windows, and route flow."
        if isinstance(gemini_result, dict) and isinstance(gemini_result.get("summary"), str) and gemini_result.get("summary"):
            summary = str(gemini_result.get("summary"))

        if not all_optimal and GEMINI_API_KEY:
            refinement_prompt = "\n".join([
                f"Refine this draft itinerary for {city}.",
                "Use the compiled schedule below and keep all items. Return JSON only with keys: orderedIds, analysis, summary.",
                f"Compiled schedule: {json.dumps(analysis_rows, ensure_ascii=False)}",
                f"Places: {json.dumps(optimized_items, ensure_ascii=False)}",
            ])
            refinement = await call_gemini_json(refinement_prompt)
            if isinstance(refinement, dict):
                ordered_ids = [str(item) for item in (refinement.get("orderedIds") or []) if str(item).strip()]
                if ordered_ids:
                    id_map = {str(place.get("id")): place for place in ordered_places}
                    ordered_places = [id_map[item_id] for item_id in ordered_ids if item_id in id_map] + [place for place in ordered_places if str(place.get("id")) not in ordered_ids]
                    analysis_rows, optimized_items, all_optimal = _compile_optimized_draft_schedule(ordered_places, start_minutes, end_minutes, original_map)
                if isinstance(refinement.get("summary"), str) and refinement.get("summary"):
                    summary = str(refinement.get("summary"))

        return {
            "city": city,
            "draftItinerary": analysis_rows,
            "reordered": analysis_rows,
            "output": [
                {
                    "place": row["place"],
                    "duration": row["duration"],
                    "recommended_time": row["recommended_time"],
                    "user_time": row["user_time"],
                    "status": row["status"],
                    "suggestion": row["suggestion"],
                    "scheduled_time": optimized_items[idx].get("time") if idx < len(optimized_items) else row["recommended_time"],
                }
                for idx, row in enumerate(analysis_rows)
            ],
            "optimizedItems": optimized_items,
            "allOptimal": all_optimal,
            "summary": summary,
        }
    except Exception as exc:
        logger.exception("draft itinerary analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to analyze draft itinerary")


def _build_template_recommendations(
    destination: str,
    interests: List[str],
    archetypes: List[str],
    exclude_names: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    base_interest = interests[0] if interests else "local culture"
    base_archetype = archetypes[0] if archetypes else "traveler"
    templates = [
        ("Old Town Heritage Walk", "Heritage", 120, "morning", "medium"),
        ("Central Street Food Cluster", "Food", 75, "evening", "high"),
        ("City Art & Craft District", "Culture", 90, "afternoon", "medium"),
        ("Botanical Garden Loop", "Nature", 80, "morning", "low"),
        ("Sunset Viewpoint", "Viewpoint", 60, "evening", "medium"),
        ("Local Market Experience", "Market", 90, "afternoon", "high"),
        ("Hidden Courtyard Trail", "Culture", 70, "morning", "low"),
        ("Riverside Evening Promenade", "Nature", 85, "evening", "medium"),
        ("Local Coffee Roastery", "Cafe", 50, "afternoon", "medium"),
        ("Weekend Artisan Bazaar", "Market", 100, "afternoon", "high"),
        ("Panoramic Skyline Deck", "Viewpoint", 45, "evening", "medium"),
        ("City Museum Annex", "Museum", 110, "morning", "low"),
    ]
    out: List[Dict[str, Any]] = []
    blocked = exclude_names or set()
    for idx, (title, category, minutes, best_time, crowd) in enumerate(templates):
        computed_name = f"{title} - {destination}"
        if normalize_query(computed_name).lower() in blocked:
            continue
        out.append(
            {
                "id": f"tmpl-{idx}-{int(time.time())}",
                "destination": destination,
                "name": computed_name,
                "address": destination,
                "category": category,
                "why": f"Aligned with {base_interest} and your {base_archetype} style.",
                "estimatedMinutes": minutes,
                "bestTime": best_time,
                "crowdLevel": crowd,
                "image": None,
                "rating": None,
                "reviews": None,
                "lat": None,
                "lng": None,
                "archetypeMatch": archetypes,
            }
        )

    # Generate extra synthetic recommendations if exclusions remove too many templates.
    extra_idx = 1
    while len(out) < 12:
        generated_name = f"Discovery Pick {extra_idx} - {destination}"
        if normalize_query(generated_name).lower() not in blocked:
            out.append(
                {
                    "id": f"tmpl-extra-{extra_idx}-{int(time.time())}",
                    "destination": destination,
                    "name": generated_name,
                    "address": destination,
                    "category": "Attraction",
                    "why": f"Fresh alternative tuned for {base_archetype} and {base_interest}.",
                    "estimatedMinutes": 75,
                    "bestTime": "anytime",
                    "crowdLevel": "medium",
                    "image": None,
                    "rating": None,
                    "reviews": None,
                    "lat": None,
                    "lng": None,
                    "archetypeMatch": archetypes,
                }
            )
        extra_idx += 1

    return out


async def save_user_recommendations(user_id: str, recs_data: Dict[str, Any]) -> bool:
    """Save recommendations to user's profile/recommendations table."""
    try:
        # Extract user token from headers if available
        user_token = None
        # For this function being called from get_recommendations, we'll use service role
        # In real scenario, pass token through if needed
        
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        }
        
        payload = {
            "user_id": user_id,
            "destinations": recs_data.get("destinations", []),
            "interests": recs_data.get("interests", []),
            "archetypes": recs_data.get("archetypes", []),
            "recommendations": recs_data.get("recommendations", []),
            "created_at": recs_data.get("createdAt", datetime.now().isoformat()),
            "updated_at": datetime.now().isoformat(),
        }
        
        url = f"{SUPABASE_URL}/rest/v1/user_recommendations"
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(url, json=payload, headers=headers)
        
        if res.is_error:
            logger.warning("save_user_recommendations failed: %s", res.text)
            return False
        
        return True
    except Exception as exc:
        logger.warning("save_user_recommendations exception: %s", exc)
        return False


@app.get("/api/user/recommendations")
async def get_user_recommendations(request: Request):
    """Fetch saved recommendations for the authenticated user."""
    user_id = await get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE,
            "Content-Type": "application/json",
        }
        
        url = f"{SUPABASE_URL}/rest/v1/user_recommendations?user_id=eq.{user_id}"
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(url, headers=headers)
        
        if res.is_error:
            logger.warning("get_user_recommendations failed: %s", res.text)
            return {"recommendations": []}
        
        data = res.json()
        if data and len(data) > 0:
            return {"recommendations": data[0].get("recommendations", [])}
        
        return {"recommendations": []}
    
    except Exception as exc:
        logger.warning("get_user_recommendations exception: %s", exc)
        return {"recommendations": []}


@app.post("/api/weather-hint")
async def weather_hint(payload: WeatherHintRequest):
    """Return best-time hint for a place based on weather. Uses Open-Meteo (no API key required)."""
    hint = await fetch_weather_hint(payload.city or payload.location or "", payload.title or "", payload.lat, payload.lng)
    if not hint:
        raise HTTPException(status_code=502, detail="weather lookup failed")
    return hint


@app.get("/api/best-visit-month")
async def best_visit_month(city: str):
    normalized_city = normalize_query(city)
    if not normalized_city:
        raise HTTPException(status_code=400, detail="city is required")

    cache_key = normalized_city.lower()
    now = time.time()
    cached = _CITY_BEST_MONTH_CACHE.get(cache_key)
    if cached and cached.get("expires_at", 0) > now:
        return {"city": normalized_city, "month": cached.get("month", "Apr")}

    if not GEMINI_API_KEY:
        return {"city": normalized_city, "month": "Apr"}

    prompt = f"""
You are helping a travel app.
Based on general travel blogs and broad consensus, what is the single best month to visit {normalized_city}?

Return ONLY one month name (for example: April).
No sentence, no punctuation, no extra words.
""".strip()

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                ]
            }
        ]
    }

    candidate_models = [
        os.getenv("GEMINI_FAST_MODEL", "").strip(),
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash",
    ]
    candidate_models = [m for m in candidate_models if m]

    month = "Apr"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            for model_name in candidate_models:
                g_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
                res = await client.post(g_url, json=payload)
                if res.is_error:
                    continue
                data = res.json() if res.content else {}
                text = (
                    data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )
                month = normalize_month_abbrev(text)
                break
    except Exception:
        month = "Apr"

    _CITY_BEST_MONTH_CACHE[cache_key] = {
        "month": month,
        "expires_at": now + 86400,
    }
    return {"city": normalized_city, "month": month}


@app.post("/api/food-slot")
async def food_slot(req: FoodSlotRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini key missing")

    prefs = req.preferences or {}
    diet = prefs.get("diet") or prefs.get("dietLifestyle") or ""
    prompt = [
        "You help place restaurants into a day plan.",
        f"Restaurant: {req.name}",
        f"City: {req.city or 'unknown'}",
        f"User diet/preferences: {prefs}",
        "Return JSON with keys: slot (breakfast|brunch|lunch|evening|dinner) and note (<=20 words).",
        "If no strong signal, choose lunch. If fancy, prefer dinner. Cafes -> brunch/evening.",
    ]

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": "\n".join(prompt)},
                ]
            }
        ]
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(url, json=payload)
        if res.is_error:
            raise HTTPException(status_code=502, detail="gemini food slot failed")
        data = res.json()
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
        parsed = safe_json_parse(text)
        if isinstance(parsed, dict) and parsed.get("slot"):
            slot = str(parsed.get("slot")).lower()
            if slot not in {"breakfast", "brunch", "lunch", "evening", "dinner"}:
                slot = "lunch"
            return {"slot": slot, "note": parsed.get("note")}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("food-slot failed: %s", exc)
    return {"slot": "lunch", "note": "Placed at lunch by default."}


@app.post("/api/snack-nearby")
async def snack_nearby(req: SnackRequest):
    coords = None
    if isinstance(req.lat, (int, float)) and isinstance(req.lng, (int, float)):
        coords = {"lat": req.lat, "lon": req.lng}
    elif req.city:
        coords = await resolve_coords(req.city, {})
    if not coords:
        raise HTTPException(status_code=400, detail="coords or city required")

    # Target light bites / juice close by
    queries = [
        "juice bar",
        "snack shop",
        "quick bites",
        f"cafe near {req.title}" if req.title else "cafe",
    ]
    for q in queries:
        hits = await search_google_places(q, coords, req.city, kind="food", limit=5)
        if hits:
            pick = hits[0]
            return {
                "name": pick.get("name"),
                "address": pick.get("address"),
                "lat": pick.get("lat"),
                "lng": pick.get("lng"),
                "placeId": pick.get("placeId"),
                "category": "Food - snack",
            }
    raise HTTPException(status_code=404, detail="No nearby snack found")


@app.post("/api/analyze-reel")
async def extract_reel(payload: Dict[str, Any], request: Request):
    """Extract destinations from an Instagram Reel URL using a Fast Text pass."""
    def no_destinations(detail: str, caption: str = "") -> Dict[str, Any]:
        return {
            "destinations": [],
            "caption": caption,
            "detail": detail,
        }

    raw_url = (payload.get("url") or payload.get("reelUrl") or "").strip()
    if not raw_url:
        raise HTTPException(status_code=400, detail="Invalid Instagram URL")

    url = canonicalize_instagram_reel_url(raw_url)
    if not url:
        raise HTTPException(status_code=400, detail="Invalid Instagram URL")

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key missing on server")

    user_id = await get_user_id(request)

    ydl_opts_meta = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "retries": 2,
        "extractor_retries": 2,
        "socket_timeout": 20,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts_meta) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get("title", "")
            description = info.get("description", "")
    except Exception as e:
        logger.warning("yt-dlp primary meta error: %s", e)
        # One more attempt with alternate extractor args for Instagram.
        try:
            retry_opts = {
                **ydl_opts_meta,
                "extractor_args": {
                    "instagram": {
                        "api_version": ["v1"],
                        "include_dash_manifest": ["false"],
                    }
                },
            }
            with yt_dlp.YoutubeDL(retry_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                title = info.get("title", "")
                description = info.get("description", "")
        except Exception as e2:
            logger.error("yt-dlp retry meta error: %s", e2)
            return no_destinations("Failed to fetch Reel metadata. Ensure the reel is public.")

    instagram_caption = ""
    try:
        instagram_caption = await get_instagram_caption(raw_url)
    except Exception as exc:
        logger.info("instagram caption helper failed: %s", exc)

    caption_text = choose_best_caption(description, instagram_caption, title)
    if not caption_text:
        caption_text = description or instagram_caption or title
    caption_text = clean_caption_for_extraction(caption_text)

    fast_prompt = f"""
You are extracting a real-world establishment from a social media caption.
The caption may include a line starting with "Location" or a full postal address.

Rules:
1) If a full address is present, prefer it over guesses.
2) Extract the establishment/business name.
3) Extract the city from the address if available.
4) Ignore hashtags and opinions.

Return ONLY JSON:

{{
    "place_detected": true,
    "place_name": "",
    "city": "",
    "address_hint": ""
}}

If no real visitable place exists:
{{
    "place_detected": false
}}

Caption:
{(caption_text or "")[:1800]}
"""

    async def persist(destinations: List[Dict[str, Any]]):
        if destinations and user_id:
            asyncio.create_task(insert_reel_extraction(url, destinations, caption_text, user_id))

    async def fallback_enrich():
        fb = await fallback_parse_places(caption_text)
        if fb:
            logger.info("Using fallback caption parser")
            await persist(fb)
            return {"destinations": fb, "caption": caption_text}
        return no_destinations("Could not detect destinations from this reel caption.", caption_text)

    try:
        global _GEMINI_FASTPASS_BLOCK_UNTIL

        # Quota-aware cooldown: if quota was recently exhausted, skip Gemini fast pass temporarily
        # and go directly to the lightweight caption fallback parser.
        if _GEMINI_FASTPASS_BLOCK_UNTIL > time.time():
            remaining = int(_GEMINI_FASTPASS_BLOCK_UNTIL - time.time())
            logger.info("Skipping Gemini fast pass for %ss due to recent quota exhaustion", max(0, remaining))
            return await fallback_enrich()

        gemini_payload = {"contents": [{"parts": [{"text": fast_prompt}]}]}
        preferred_models = [
            os.getenv("GEMINI_FAST_MODEL", "").strip(),
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash-lite",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ]
        preferred_models = [m for m in preferred_models if m]

        available_models = await get_gemini_generate_models()
        if available_models:
            model_candidates = [m for m in preferred_models if m in available_models]
            if not model_candidates:
                # Fallback to the first supported generateContent model if preferred ones are unavailable.
                model_candidates = available_models[:1]
        else:
            # If model discovery fails, still try modern defaults.
            model_candidates = preferred_models

        resp = None
        last_error_text = None
        quota_exhausted = False
        async with httpx.AsyncClient(timeout=20) as client:
            for model_name in model_candidates:
                g_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
                candidate_resp = await client.post(g_url, json=gemini_payload)
                if not candidate_resp.is_error:
                    resp = candidate_resp
                    break
                last_error_text = candidate_resp.text
                logger.warning("gemini fast pass failed for %s: %s", model_name, candidate_resp.text)
                # If quota is exhausted, no point in trying all remaining models for this request.
                if candidate_resp.status_code == 429 or "RESOURCE_EXHAUSTED" in (candidate_resp.text or ""):
                    quota_exhausted = True
                    cooldown = parse_retry_delay_seconds(candidate_resp.text or "")
                    _GEMINI_FASTPASS_BLOCK_UNTIL = time.time() + cooldown
                    logger.warning("Gemini quota exhausted. Backing off fast pass for %ss", cooldown)
                    break

        if resp is None:
            if last_error_text:
                logger.warning("gemini fast pass failed for all models: %s", last_error_text)
            if quota_exhausted:
                logger.info("gemini quota exhausted; using caption fallback parser")
            return await fallback_enrich()

        data = resp.json()
        txt = None
        try:
            txt = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
        except Exception:
            txt = None
        txt = txt or ""
        if txt.startswith("```json"):
            txt = txt[7:]
        if txt.startswith("```"):
            txt = txt[3:]
        if txt.endswith("```"):
            txt = txt[:-3]

        ai_obj = json.loads(txt.strip()) if txt.strip() else {}

        if isinstance(ai_obj, dict) and ai_obj.get("place_detected"):
            query = build_place_query(ai_obj)
            verified = await search_place_verified(query, ai_obj) if query else None
            if verified:
                must_try = extract_must_try(caption_text)
                if must_try:
                    verified["must_try"] = must_try
                await persist([verified])
                return {"destinations": [verified], "caption": caption_text}
        return await fallback_enrich()

    except HTTPException:
        return await fallback_enrich()
    except Exception as e:
        logger.warning("Fast pass text extraction failed or was empty: %s", e)
        return await fallback_enrich()

@app.get("/audio-proxy")
async def audio_proxy(url: str):
    if not url or not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="invalid audio url")
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            res = await client.get(url)
        if res.is_error:
            raise HTTPException(status_code=502, detail="upstream audio fetch failed")
        content = res.content
        if content and len(content) > MAX_PROXY_BYTES:
            raise HTTPException(status_code=413, detail="audio too large")
        content_type = res.headers.get("content-type") or ("audio/ogg" if url.lower().endswith(".ogg") else "audio/mpeg")
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        }
        return Response(content=content, media_type=content_type, headers=headers)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("audio proxy failed: %s", exc)
        raise HTTPException(status_code=502, detail="audio proxy error")


def build_image_fallback_svg(label: str) -> bytes:
        safe_label = (label or "City view").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        svg = f"""
<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800' viewBox='0 0 1200 800'>
    <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%' stop-color='#0f172a'/>
            <stop offset='50%' stop-color='#1e3a8a'/>
            <stop offset='100%' stop-color='#312e81'/>
        </linearGradient>
    </defs>
    <rect width='1200' height='800' fill='url(#g)'/>
    <circle cx='180' cy='140' r='95' fill='rgba(255,255,255,0.12)'/>
    <rect x='0' y='520' width='1200' height='280' fill='rgba(0,0,0,0.18)'/>
    <text x='50%' y='50%' text-anchor='middle' fill='#e5e7eb' font-size='56' font-family='Arial, sans-serif' font-weight='700'>{safe_label}</text>
    <text x='50%' y='58%' text-anchor='middle' fill='#cbd5e1' font-size='24' font-family='Arial, sans-serif'>Curated city visual</text>
</svg>
""".strip()
        return svg.encode("utf-8")


async def fetch_image_bytes_from_url(url: str) -> Optional[tuple[bytes, str]]:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            res = await client.get(url, headers={"User-Agent": "Stellora/1.0"})
        if res.is_error or not res.content:
            return None
        media_type = res.headers.get("content-type") or "image/jpeg"
        return res.content, media_type
    except Exception:
        return None


def city_title_candidates(city: str) -> List[str]:
    normalized = normalize_query(city)
    lowered = normalized.lower()
    candidates: List[str] = []

    def add(value: str):
        value = normalize_query(value)
        if value and value.lower() not in {c.lower() for c in candidates}:
            candidates.append(value)

    add(normalized)
    if "bengaluru" in lowered or "bangalore" in lowered:
        add("Bengaluru")
        add("Bangalore")
    if "," in normalized:
        add(normalized.split(",")[-1].strip())
    words = normalized.split()
    if words:
        add(words[-1])

    return candidates[:6]


async def fetch_wikipedia_city_image(city: str) -> Optional[tuple[bytes, str]]:
    candidates = city_title_candidates(city)
    if not candidates:
        return None

    for title in candidates:
        summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title)}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.get(summary_url, headers={"User-Agent": "Stellora/1.0"})
            if res.is_error:
                continue
            payload = res.json() if res.content else {}
            image_url = None
            if isinstance(payload, dict):
                original = payload.get("originalimage") if isinstance(payload.get("originalimage"), dict) else {}
                thumb = payload.get("thumbnail") if isinstance(payload.get("thumbnail"), dict) else {}
                image_url = original.get("source") or thumb.get("source")
            if isinstance(image_url, str) and image_url:
                img = await fetch_image_bytes_from_url(image_url)
                if img:
                    return img
        except Exception:
            continue

    return None


async def fetch_wikimedia_commons_image(query: str) -> Optional[tuple[bytes, str]]:
    if not query:
        return None
    api_url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"{query} skyline city",
        "gsrlimit": 6,
        "prop": "imageinfo",
        "iiprop": "url",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(api_url, params=params, headers={"User-Agent": "Stellora/1.0"})
        if res.is_error:
            return None
        payload = res.json() if res.content else {}
        pages = (payload.get("query") or {}).get("pages") if isinstance(payload, dict) else None
        if not isinstance(pages, dict):
            return None
        for page in pages.values():
            if not isinstance(page, dict):
                continue
            infos = page.get("imageinfo")
            if not isinstance(infos, list) or not infos:
                continue
            info = infos[0] if isinstance(infos[0], dict) else {}
            image_url = info.get("url")
            if isinstance(image_url, str) and image_url:
                data = await fetch_image_bytes_from_url(image_url)
                if data:
                    return data
    except Exception:
        return None
    return None


async def fetch_public_fallback_photo(seed: str) -> Optional[tuple[bytes, str]]:
    safe_seed = re.sub(r"[^a-zA-Z0-9]+", "-", (seed or "city")).strip("-") or "city"
    url = f"https://picsum.photos/seed/{quote(safe_seed)}/1200/800"
    return await fetch_image_bytes_from_url(url)


async def fetch_place_photo_bytes_old_google(ref: str, maxwidth: int = 800) -> Optional[tuple[bytes, str]]:
    """DEPRECATED: Old Google Places photo fetcher. Use Unsplash instead."""
    return None  # Gracefully fail - callers will use fallback


async def fetch_place_photo_by_query_old_google(query: str, maxwidth: int = 800) -> Optional[tuple[bytes, str]]:
    """DEPRECATED: Old Google Places photo fetcher. Use Unsplash instead."""
    return None  # Gracefully fail - callers will use fallback


@app.get("/api/place-photo")
async def place_photo_proxy(ref: str = "", query: str = ""):
    """Fetch place photo using free Unsplash API or fallback sources."""
    
    if not ref and not query:
        raise HTTPException(status_code=400, detail="photo reference or query required")

    # Try Unsplash with the provided query or reference
    search_term = query or ref or "place"
    photo = await fetch_place_photo_by_query(search_term)
    
    if photo:
        content, media_type = photo
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Cache-Control": "public, max-age=86400",
                "Access-Control-Allow-Origin": "*",
            },
        )
    
    # Try fallback sources
    public = await fetch_public_fallback_photo(search_term)
    if public:
        content, media_type = public
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
            },
        )
    
    # Return SVG placeholder
    return Response(
        content=build_image_fallback_svg(search_term or "Place Photo"),
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.get("/api/city-image")
async def city_image_proxy(city: str):
    if not city:
        raise HTTPException(status_code=400, detail="city is required")

    image = await fetch_wikipedia_city_image(city)
    if not image:
        image = await fetch_wikimedia_commons_image(city)
    if not image:
        image = await fetch_public_fallback_photo(city)
    if image:
        content, media_type = image
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Cache-Control": "public, max-age=43200",
                "Access-Control-Allow-Origin": "*",
            },
        )

    return Response(
        content=build_image_fallback_svg(city),
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.get("/api/static-map")
async def static_map_proxy(
    query: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    width: int = 640,
    height: int = 360,
    zoom: int = 14,
):
    """Return a free map image URL using Unsplash or OpenStreetMap services."""
    
    w = max(200, min(640, int(width or 640)))
    h = max(200, min(640, int(height or 360)))
    z = max(3, min(20, int(zoom or 14)))

    # Try to get a map image via free sources
    map_query = query or ""
    
    # Try Unsplash for scene/location image first
    if map_query:
        photo = await fetch_place_photo_by_query(map_query)
        if photo:
            content, media_type = photo
            return Response(
                content=content,
                media_type=media_type,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    
    # Try Wikipedia/Wikimedia images
    if map_query:
        wiki_image = await fetch_wikipedia_city_image(map_query)
        if not wiki_image:
            wiki_image = await fetch_wikimedia_commons_image(map_query)
        if wiki_image:
            content, media_type = wiki_image
            return Response(
                content=content,
                media_type=media_type,
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    
    # Try generic fallback image
    fallback = await fetch_public_fallback_photo(map_query or "map")
    if fallback:
        content, media_type = fallback
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
            },
        )
    
    # Final fallback: SVG placeholder
    return Response(
        content=build_image_fallback_svg(f"Map: {map_query or f'{lat},{lng}'}"),
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.post("/generate-story")
async def generate_story(payload: Dict[str, Any]):
    """Generate quick (<30s) + full (~2 min) audio stories for a place using Gemini + ElevenLabs TTS."""
    name = payload.get("name") or payload.get("title")
    lat = payload.get("lat")
    lon = payload.get("lon")
    xid = payload.get("xid")
    place_id = payload.get("place_id")
    kinds = payload.get("kinds")
    rating = payload.get("rating")
    reviews = payload.get("reviewsSnippet") or payload.get("reviews")
    vicinity = payload.get("vicinity") or payload.get("location")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY missing on server")
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY missing on server")

    # Enrich context from Google Places if place_id provided
    place_context = await fetch_place_context(place_id) if place_id else None
    if place_context:
        name = place_context.get("name") or name
        rating = place_context.get("rating") or rating
        kinds = ",".join(place_context.get("types", [])) if place_context.get("types") else kinds
        reviews = place_context.get("reviewsSnippet") or reviews
        vicinity = place_context.get("vicinity") or vicinity
        lat = lat or (place_context.get("geometry", {}).get("location", {}).get("lat"))
        lon = lon or (place_context.get("geometry", {}).get("location", {}).get("lng"))

    try:
        quick_script, full_script, summary = await build_story_script(name, lat, lon, kinds, rating, reviews)
    except Exception as exc:
        logger.warning("gemini build_story_script failed: %s", exc)
        quick_script, full_script, summary = None, None, None

    quick_audio = await text_to_speech(quick_script) if quick_script else None
    full_audio = await text_to_speech(full_script) if full_script else None
    if not quick_audio or not full_audio:
        raise HTTPException(status_code=502, detail="TTS failed to generate audio")
    record = {
        "title": name,
        "place_id": place_id,
        "xid": xid,
        "lat": lat,
        "lon": lon,
        "audio_url_quick": quick_audio,
        "audio_url_full": full_audio,
        "summary": summary or (quick_script[:220] if quick_script else None),
        "duration_minutes": 2,
        "location": vicinity or name,
    }

    await upsert_story(record)
    return record


async def get_user_id(request: Request) -> Optional[str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
        return None
    auth_header = request.headers.get("authorization") or ""
    token = auth_header[7:] if auth_header.lower().startswith("bearer ") else None
    if not token:
        return None
    url = f"{SUPABASE_URL}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": SUPABASE_SERVICE_ROLE,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, headers=headers)
        if res.is_error:
            return None
        data = res.json()
        return data.get("id") if isinstance(data, dict) else None
    except Exception:
        return None


@app.get("/health/supabase")
async def supabase_health():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
        return {"ok": False, "reason": "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE"}
    url = f"{SUPABASE_URL}/auth/v1/health"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
    }
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.get(url, headers=headers)
        return {"ok": res.status_code == 200, "status": res.status_code}
    except Exception as exc:
        logger.warning("supabase health check failed: %s", exc)
        return {"ok": False, "reason": str(exc)}


@app.post("/generate-full-itinerary")
@app.post("/api/generate-full-itinerary")
async def generate_full_itinerary(payload: Dict[str, Any], user_id: Optional[str] = Depends(get_user_id)):
    """Generate a full day itinerary using Gemini, respecting user picks and constraints."""
    try:
        city = payload.get("city")
        plan = payload.get("plan") or {}
        chosen = payload.get("chosen") or {}
        speed_run = bool(payload.get("speedRun"))
        
        # 1. Resolve City Coords
        coords = await resolve_coords(city, plan.get("locationPref") or {})
        if not coords:
             # Fallback to Bengaluru if unknown, just to keep running
            coords = {"lat": 12.9716, "lon": 77.5946}

        # 2. Collect all must-visit names
        must_visits = []
        for cat, items in chosen.items():
            if isinstance(items, list):
                must_visits.extend(items)
        
        # 3. Resolve details for must-visits (parallel search)
        # We limit specific searches to avoid rate limits, but for "generate" it's okay to do a few.
        resolved_musts = []
        async def _resolve(name):
             res = await search_google_places(name, coords, city, limit=1)
             return res[0] if res else {"name": name, "address": city, "category": "General", "coords": coords, "openingHours": None}

        if must_visits:
            results = await asyncio.gather(*[_resolve(name) for name in must_visits])
            resolved_musts = list(results)

        # 4. Fetch a pool of fillers (restaurants, attractions) if we need more options
        # We'll get some generic popular spots to give Gemini options for gaps
        fillers = []
        if len(resolved_musts) < 8:
             # Fetch generic top rated stuff
             more_places = await search_google_places("top sights", coords, city, limit=10)
             more_food = await search_google_places("best local food", coords, city, limit=10)
             fillers = more_places + more_food

        # 5. Build Gemini Prompt
        prompt = build_full_itinerary_prompt(city, plan, resolved_musts, fillers, speed_run)
        
        # 6. Call Gemini
        ai_response = await call_gemini_json(prompt)
        
        # 7. Fallback if AI fails: simple linear timeline
        final_timeline = ai_response.get("timeline") if ai_response else []
        overflow = ai_response.get("overflow") if ai_response else []
        analysis = ai_response.get("analysis") if ai_response else None
        
        if not final_timeline and resolved_musts:
             # Basic fallback aligned to selected day window
             def _to_mins(hm: Optional[str], default_mins: int) -> int:
                 try:
                     if not hm:
                         return default_mins
                     hh, mm = hm.split(":")
                     return int(hh) * 60 + int(mm)
                 except Exception:
                     return default_mins

             start_mins = _to_mins(plan.get("dayStart"), 9 * 60)
             end_mins_raw = _to_mins(plan.get("dayEnd"), 21 * 60)
             end_mins = end_mins_raw if end_mins_raw > start_mins else start_mins + 12 * 60
             cursor = start_mins

             for item in resolved_musts:
                 duration = 90
                 slot_start = min(cursor, max(start_mins, end_mins - duration))
                 slot_end = min(end_mins, slot_start + duration)
                 start_h, start_m = divmod(slot_start, 60)
                 end_h, end_m = divmod(slot_end, 60)
                 final_timeline.append({
                     "timeSlot": f"{start_h:02d}:{start_m:02d} - {end_h:02d}:{end_m:02d}",
                     "title": item.get("name"),
                     "location": item.get("address") or item.get("vicinity"),
                     "category": item.get("category") or "General",
                     "durationMinutes": duration,
                     "note": "Chosen stop",
                     "status": "planned"
                 })
                 cursor = slot_end

        # 8. Persist to Supabase
        if final_timeline or overflow:
            if SUPABASE_URL and SUPABASE_SERVICE_ROLE:
                try:
                    # Delete existing planned items for this city/user (simple cleanup for demo)
                    headers = {
                        "apikey": SUPABASE_SERVICE_ROLE,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    }

                    async with httpx.AsyncClient() as client:
                        await client.delete(
                           f"{SUPABASE_URL}/rest/v1/itinerary_items?city=eq.{quote(city)}&status=eq.planned&day_number=eq.1",
                           headers=headers
                        )

                    records = []
                    for item in final_timeline:
                        records.append({
                            "city": city,
                            "title": item.get("title"),
                            "location": item.get("location"),
                            "category": item.get("category"),
                            "time_slot": item.get("timeSlot"),
                            "duration_minutes": item.get("durationMinutes"),
                            "note": item.get("note"),
                            "status": "planned",
                            "xid": item.get("id", str(uuid4())),
                            "plan_date": datetime.now().strftime("%Y-%m-%d"),
                            "day_number": 1,
                            "crowd_level": item.get("crowdLevel", "Medium"),
                        })

                    if records:
                        async with httpx.AsyncClient() as client:
                             await client.post(
                                f"{SUPABASE_URL}/rest/v1/itinerary_items",
                                json=records,
                                headers=headers
                             )
                except Exception as e:
                    logger.error(f"Failed to persist itinerary: {e}")
            else:
                logger.warning("Skipping Supabase persist: SUPABASE_URL or SERVICE_ROLE missing")

        return {
            "timeline": final_timeline,
            "overflow": overflow,
            "analysis": analysis,
            "city": city,
            "generated_at": datetime.now().isoformat()
        }

    except Exception as exc:
        logger.exception("generate itinerary failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


def build_full_itinerary_prompt(city: str, plan: Dict[str, Any], musts: List[Dict[str, Any]], fillers: List[Dict[str, Any]], speed_run: bool = False) -> str:
    # Summarize plan prefs
    vibe = plan.get("answers", {}).get("vibe") or "balanced"
    diet = plan.get("answers", {}).get("diet") or "any"
    start_time = plan.get("startTime") or "09:00"
    trip_len = plan.get("tripDuration") or "Full Day"
    
    # Filter keys for prompt to save tokens but keep essentials
    def clean(lst):
        return [{k: v for k, v in m.items() if k in ['name', 'category', 'rating', 'coords', 'openingHours', 'vicinity', 'kinds']} for m in lst]

    return "\n".join([
        f"Act as an expert travel logistician for a day trip in {city}.",
        f"Context: Vibe={vibe}, Diet={diet}, Start={start_time}, Duration={trip_len}.",
        "TASK: Create a strictly timed, geographically optimized itinerary.",
        "",
        "INPUT DATA:",
        f"1. MUST VISIT (User Choices): {json.dumps(clean(musts))}",
        f"2. CANDIDATE POOL (Fillers): {json.dumps(clean(fillers))}",
        "",
        "CRITICAL RULES:",
        "1. **Time & Operations**: Check 'openingHours' for EVERY stop. Do NOT schedule a stop when it is closed. If a Must Visit is closed all day, move to overflow.",
        "2. **STRICT 8 PM END**: The itinerary MUST end by 20:00 (8 PM). Any activity that would push the Schedule past 20:00 MUST be moved to 'overflow'. Do not schedule anything after 8 PM.",
        "3. **Geo-Spatial Optimization**: Sequence stops by shortest distance. Minimize travel time. Group nearby items.",
        "4. **Meal Logic**: Insert meals (Breakfast, Lunch, Light Eats, Dinner) strictly based on time of day AND proximity. e.g. If at Site A at 1PM, find a Lunch spot from Candidate Pool that is CLOSEST to Site A.",
        "5. **Real-Time Crowd Analysis (Simulated)**: For each stop, estimate the 'crowdLevel' (Low, Medium, High, Critical) based on the specific Time of Day and Day of Week. IF crowdLevel is 'High' or 'Critical', INCREASE the durationMinutes by 20-30 minutes to account for queues.",
        ("6. **SPEED RUN MODE**: user wants to squeeze EVERYTHING in. Reduce duration at each stop to the absolute minimum to fit all Must Visits. Only move to overflow if physically impossible." if speed_run else "6. **Pacing**: Allow reasonable duration for enjoyment. Move items to 'overflow' if they don't fit comfortably."),
        "7. **Smart Categorization**: Label each timeline item with its role (e.g. 'Morning Exploration', 'Lunch Break', 'Cultural Deep Dive').",
        "",
        "OUTPUT FORMAT (JSON only):",
        "{",
        "  'timeline': [",
        "    { 'timeSlot': 'HH:MM - HH:MM', 'title': 'Exact Name', 'location': 'Address', 'durationMinutes': 90, 'category': 'Type', 'note': 'Why here? (e.g. 5min walk from prev stop)', 'status': 'planned' }",
        "  ],",
        "  'overflow': [ ...items that didnt fit or were closed... ],",
        "  'analysis': 'Brief explanation of the route logic (e.g. We grouped Old City spots in morning...)'",
        "}"
    ])


async def call_gemini_json(prompt_text: str) -> Optional[Dict[str, Any]]:
    global _GEMINI_FASTPASS_BLOCK_UNTIL
    if not GEMINI_API_KEY:
        return None

    if _GEMINI_FASTPASS_BLOCK_UNTIL > time.time():
        return None
    
    payload = {
        "contents": [{"parts": [{"text": prompt_text}]}]
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    
    async with httpx.AsyncClient(timeout=40) as client:
        res = await client.post(url, json=payload)
    
    if res.is_error:
        if res.status_code == 429 or "RESOURCE_EXHAUSTED" in (res.text or ""):
            cooldown = parse_retry_delay_seconds(res.text or "")
            _GEMINI_FASTPASS_BLOCK_UNTIL = time.time() + cooldown
            logger.warning("Gemini rate limited. Backing off generateContent calls for %ss", cooldown)
        return None
        
    try:
        txt = res.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
        return safe_json_parse(txt)
    except:
        return None


@app.post("/adjust-itinerary")
async def adjust_itinerary(payload: Dict[str, Any], user_id: Optional[str] = Depends(get_user_id)):
    try:
        city = payload.get("city")
        behind = bool(payload.get("behind"))
        ahead = bool(payload.get("ahead"))
        location_pref = payload.get("locationPref", {}) or {}
        items = payload.get("items") or []
        mood = payload.get("mood")
        category_pref = payload.get("categoryPref")
        diet = payload.get("diet")
        more_ideas = bool(payload.get("moreIdeas"))
        trip_duration = payload.get("tripDurationHours") or payload.get("tripDuration") or 8
        diet_norm = diet.lower() if isinstance(diet, str) else None

        coords = await resolve_coords(city, location_pref)
        if not coords:
            logger.warning("adjust-itinerary fallback: could not resolve coords; city=%s pref=%s", city, location_pref)
            coords = {"lat": 12.9716, "lon": 77.5946}  # fallback to Bengaluru centroid

        candidates = (await fetch_places_restaurants(coords["lat"], coords["lon"], diet_norm)).copy()
        candidates.extend(await fetch_nearby(coords["lat"], coords["lon"], OPENTRIPMAP_API_KEY))

        limit = 15 if more_ideas else 10
        suggested = await pick_suggestions(items, candidates, {
            "behind": behind,
            "ahead": ahead,
            "city": city,
            "mood": mood,
            "categoryPref": category_pref,
            "diet": diet,
            "limit": limit,
            "tripDurationHours": trip_duration,
        })

        enriched = [
            {
                **s,
                "status": s.get("status") or "suggested",
                "user_id": user_id,
                "city": city,
            }
            for s in suggested
        ]

        if user_id:
            await upsert_itinerary_items(enriched)

        return enriched
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("adjust-itinerary failed: %s", exc)
        raise HTTPException(status_code=500, detail="internal error")


async def resolve_coords(city: str, pref: Dict[str, Any]) -> Optional[Dict[str, float]]:
    if pref.get("mode") == "live" and isinstance(pref.get("lat"), (int, float)) and isinstance(pref.get("lng"), (int, float)):
        return {"lat": float(pref["lat"]), "lon": float(pref["lng"])}
    if not city:
        return None

    # Prefer OpenTripMap geoname if key is available
    global _OTM_GEONAME_DISABLED
    if OPENTRIPMAP_API_KEY and not _OTM_GEONAME_DISABLED:
        try:
            url = f"https://api.opentripmap.com/0.1/en/places/geoname?name={quote(city)}&apikey={OPENTRIPMAP_API_KEY}"
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(url)
            if res.status_code == 401:
                _OTM_GEONAME_DISABLED = True
            if not res.is_error:
                data = res.json()
                if isinstance(data, dict) and isinstance(data.get("lat"), (int, float)) and isinstance(data.get("lon"), (int, float)):
                    return {"lat": float(data["lat"]), "lon": float(data["lon"])}
        except Exception:
            pass

    # Fallback: Nominatim API (free, OSM-based, no key needed)
    try:
        nom_url = f"https://nominatim.openstreetmap.org/search?q={quote(city)}&format=json&limit=1"
        headers = {"User-Agent": "Stellora-Travel-App/1.0"}
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(nom_url, headers=headers)
        if not res.is_error:
            data = res.json()
            if isinstance(data, list) and data:
                result = data[0]
                lat = float(result.get("lat")) if result.get("lat") else None
                lon = float(result.get("lon")) if result.get("lon") else None
                if isinstance(lat, float) and isinstance(lon, float):
                    return {"lat": lat, "lon": lon}
    except Exception:
        pass

    # Final fallback: Open-Meteo geocoding helper.
    try:
        geo = await geocode_city(city)
        if geo and isinstance(geo.get("lat"), (int, float)) and isinstance(geo.get("lng"), (int, float)):
            return {"lat": float(geo["lat"]), "lon": float(geo["lng"])}
    except Exception:
        pass

    return None


async def fetch_nearby(lat: float, lon: float, api_key: Optional[str]) -> List[Dict[str, Any]]:
    if not api_key:
        return []
    kinds = "interesting_places,cultural,foods,amusements"
    radius = 20000
    limit = 20
    url = f"https://api.opentripmap.com/0.1/en/places/radius?lat={lat}&lon={lon}&radius={radius}&limit={limit}&kinds={kinds}&format=json&apikey={api_key}"
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url)
    if res.is_error:
        return []
    data = res.json()
    if not isinstance(data, list):
        return []
    return [
        {
            "xid": d.get("xid", f"otm-{idx}"),
            "name": d.get("name") or "Nearby spot",
            "dist": d.get("dist") or 0,
            "kinds": d.get("kinds") or "",
            "source": "otm",
        }
        for idx, d in enumerate(data)
    ]


async def fetch_places_restaurants(lat: float, lon: float, diet: Optional[str]) -> List[Dict[str, Any]]:
    if not OPENTRIPMAP_API_KEY:
        return []
    radius = 15000
    
    # Map diet into OpenTripMap kinds
    kinds = "foods"
    diet_val = (diet or "").lower()
    if diet_val == "veg":
        kinds = "vegan,vegetarian"
    elif diet_val == "cafe":
        kinds = "cafes"
        
    url = f"https://api.opentripmap.com/0.1/en/places/radius?lat={lat}&lon={lon}&radius={radius}&limit=15&kinds={kinds}&format=json&apikey={OPENTRIPMAP_API_KEY}"
    
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url)
        
    if res.is_error:
        return []
        
    data = res.json()
    if not isinstance(data, list):
        return []
        
    enriched = []
    for idx, d in enumerate(data):
        distance_meters = d.get("dist") or (idx * 50 + 100)
        travel_minutes = max(5, round(distance_meters / 80))
        dine_minutes = 60
        
        enriched.append({
            "xid": d.get("xid", f"otm-food-{idx}"),
            "name": d.get("name") or "Local Restaurant",
            "dist": distance_meters,
            "kinds": d.get("kinds") or kinds,
            "travelMinutes": travel_minutes,
            "durationMinutes": dine_minutes,
            "rating": 4.0, # Approximate for OTM
            "pricing": "$$",
            "source": "otm"
        })

    # Enforce 20 km radius
    return [e for e in enriched if (e.get("distanceMeters") or e.get("dist") or 0) <= 20000]


# Note: fetch_place_details is defined below as a stub (Google Places disabled)
    """Fetch place context - now returns None since Google Places is disabled."""
    # Place context is optional enrichment; gracefully return None
    # Callers should handle None and continue with available data
    return None


async def fetch_place_context(place_id: str) -> Optional[Dict[str, Any]]:
    """Fetch place context - now returns None since Google Places is disabled.
    This is an enrichment function; gracefully returns None to allow callers to continue.
    """
    return None


async def fetch_place_details(client: httpx.AsyncClient, place_id: str) -> Optional[Dict[str, Any]]:
    """Fetch place details - now returns None since Google Places is disabled."""
    return None


async def fetch_distance_matrix(lat: float, lon: float, destinations: List[str]) -> Dict[str, Dict[str, float]]:
    """Fetch distance matrix - now returns empty dict since Google Distance Matrix is disabled.
    Callers should handle empty response and use OpenStreetMap-based calculations if needed.
    """
    return {}


async def build_story_script(name: str, lat: Optional[float], lon: Optional[float], kinds: Optional[str], rating: Optional[Any], reviews: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    seed = random.randint(0, 999999)
    prompt = [
        "You are writing travel audio scripts for on-the-go listeners.",
        "Output JSON with keys: title, summary, quick_script, full_script.",
        "quick_script: <=70 words (about 25-35 seconds).",
        "full_script: ABOUT 250 WORDS (aim for 220-280 words). THIS IS CRITICAL.",
        "Tone: warm, vivid, factual, conversational.",
        "For restaurants, call out the specialty dish and why it’s loved; include price vibe; keep it one flowing paragraph (no lists).",
        f"Place: {name}.",
        f"Coords: {lat},{lon}.",
        f"Tags: {kinds}.",
        f"Rating: {rating}.",
        f"Reviews snippet: {reviews}.",
        "Must include history/heritage, one unique fact, one must-try dish, price vibe, and why it matters.",
        "Avoid headings or bullet lists; deliver as narration only.",
        f"Variation Seed: {seed} (Generate a unique take different from previous iterations).",
    ]
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": "\n".join([p for p in prompt if p])}
                ]
            }
        ]
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    async with httpx.AsyncClient(timeout=18) as client:
        res = await client.post(url, json=payload)
    if res.is_error:
        logger.warning("gemini story request failed: %s", res.text)
        raise HTTPException(status_code=502, detail="Gemini story generation failed")
    data = res.json()
    text = None
    try:
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
    except Exception:
        text = None
    parsed = safe_json_parse(text)
    if isinstance(parsed, dict):
        quick_script = parsed.get("quick_script") or parsed.get("summary") or parsed.get("script") or ""
        full_script = parsed.get("full_script") or parsed.get("script") or parsed.get("summary") or ""
        summary = parsed.get("summary") or parsed.get("title") or quick_script
    else:
        raise HTTPException(status_code=502, detail="Gemini response not in expected format")
    # Enforce caps
    def cap_words(txt: str, limit: int) -> str:
        words = txt.split()
        return " ".join(words[:limit]) if len(words) > limit else txt

    quick_script = cap_words(quick_script, 80) if quick_script else None
    full_script = cap_words(full_script, 350) if full_script else None
    return quick_script, full_script, summary


# Safety wrapper to avoid uncaught errors bubbling as 500 for reel extraction
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    logger.error("Unhandled error: %s", exc)
    return Response(content=json.dumps({"detail": "Internal error"}), status_code=500, media_type="application/json")

class PlaceSummaryRequest(BaseModel):
    name: str
    city: Optional[str] = None
    location: Optional[str] = None

@app.post("/place-summary")
async def get_place_summary(req: PlaceSummaryRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini Key missing")
    
    seed = random.randint(0, 999999)
    prompt = [
        f"Write a unique, engaging, and special summary for '{req.name}' in {req.city or req.location or 'unknown loc'}.",
        "Strict target: Approx 250 words.",
        "Include: A mix of history, hidden gems, and sensory details.",
        "Tone: Evocative and storytelling, not just dry facts.",
        f"Variation Seed: {seed} (Ensure this output is distinct from generic descriptions).",
        "Do not start with 'Here is a summary'.",
    ]

    payload = {
        "contents": [{"parts": [{"text": "\n".join(prompt)}]}]
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(url, json=payload)
    
    if res.is_error:
        # Fallback if AI fails
        return {"summary": f"{req.name} is a fascinating destination in {req.city or 'the area'}, known for its rich history and vibrant atmosphere. Explore the local culture and discover hidden spots that make this place truly special."}

    data = res.json()
    try:
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
        return {"summary": text.strip()}
    except Exception:
        return {"summary": f"{req.name} is a notable location to visit."}


async def text_to_speech(script: Optional[str]) -> Optional[str]:
    if not script:
        return None
    if not ELEVENLABS_API_KEY:
        return None
    tts_url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }
    body = {
        "text": script,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.7, "style": 0.3, "use_speaker_boost": True},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(tts_url, headers=headers, json=body)
    if res.is_error:
        print(f"TTS ERROR: {res.text}")
        logger.warning("tts failed: %s", res.text)
        return None
    b64 = base64.b64encode(res.content).decode("ascii")
    return f"data:audio/mpeg;base64,{b64}"


async def search_photon_places(query: str, coords: Optional[Dict[str, float]], city: Optional[str], kind: str = "general", limit: int = 6, radius: int = 20000) -> List[Dict[str, Any]]:
    """Search places using free Photon API (OSM-based, no API key required)."""
    norm_query = sanitize_place_query(query)
    if not norm_query:
        return []
    
    # Build search query
    search_query = norm_query if not city else f"{norm_query} {city}"
    
    # Photon free API endpoint - no key needed
    url = "https://photon.komoot.io/api"
    params = {
        "q": search_query,
        "limit": min(limit * 2, 20),  # Fetch extra to filter
        "lang": "en",
    }
    
    # Add location bias if coordinates available
    if coords and isinstance(coords.get("lat"), (int, float)) and isinstance(coords.get("lon"), (int, float)):
        params["lon"] = coords["lon"]
        params["lat"] = coords["lat"]
    
    headers = {"User-Agent": "Stellora-Travel-App/1.0"}
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, params=params, headers=headers)
        if res.is_error:
            return []
        data = res.json()
    except Exception:
        return []
    
    # Parse Photon response
    features = data.get("features", []) if isinstance(data, dict) else []
    if not isinstance(features, list):
        return []
    
    # Convert Photon features to standard place cards
    mapped: List[Dict[str, Any]] = []
    for idx, feature in enumerate(features[:limit]):
        card = map_photon_to_card(feature, idx, kind)
        if card:
            mapped.append(card)
    
    return mapped


async def search_google_places(query: str, coords: Optional[Dict[str, float]], city: Optional[str], kind: str = "general", limit: int = 6, radius: int = 20000) -> List[Dict[str, Any]]:
    """Deprecated: Use search_photon_places instead. This kept for backward compatibility."""
    return await search_photon_places(query, coords, city, kind, limit, radius)


def map_photon_to_card(feature: Dict[str, Any], idx: int, kind: str) -> Optional[Dict[str, Any]]:
    """Convert Photon API feature to standard place card format."""
    if not isinstance(feature, dict):
        return None
    
    props = feature.get("properties", {})
    geometry = feature.get("geometry", {})
    coords_raw = geometry.get("coordinates", [])
    
    # Parse coordinates - can be array [lng, lat] or string "lng lat"
    lng, lat = None, None
    if isinstance(coords_raw, str):
        # String format: "77.5868882 12.9488492"
        parts = coords_raw.strip().split()
        if len(parts) == 2:
            try:
                lng, lat = float(parts[0]), float(parts[1])
            except (ValueError, TypeError):
                pass
    elif isinstance(coords_raw, (list, tuple)) and len(coords_raw) == 2:
        # Array format: [lng, lat]
        try:
            lng, lat = float(coords_raw[0]), float(coords_raw[1])
        except (ValueError, TypeError):
            pass
    
    if lng is None or lat is None:
        return None
    
    # Extract place information from Photon
    name = props.get("name") or ""
    address_parts = []
    if props.get("street"):
        address_parts.append(props["street"])
    if props.get("city"):
        address_parts.append(props["city"])
    if props.get("state"):
        address_parts.append(props["state"])
    if props.get("country"):
        address_parts.append(props["country"])
    
    full_address = ", ".join(filter(None, address_parts)) if address_parts else name
    
    # Determine category from Photon type
    osm_type = props.get("osm_type", "")
    osm_tags = props.get("osm_tags", {}) if isinstance(props.get("osm_tags"), dict) else {}
    cuisine = osm_tags.get("cuisine", "")
    
    resolved_kind = kind
    if kind == "general":
        if osm_tags.get("amenity") in ["restaurant", "cafe", "bar", "fast_food"]:
            resolved_kind = "food-dining"
        elif osm_tags.get("tourism"):
            resolved_kind = "attraction"
    
    return {
        "id": f"photon-{idx}",
        "name": name or "Place",
        "address": full_address,
        "rating": None,  # Photon doesn't provide ratings
        "priceLevel": None,
        "userRatingsTotal": None,
        "placeId": f"osm-{props.get('osm_id', idx)}",
        "category": resolved_kind,
        "photoUrl": get_free_place_photo_url(name, full_address),
        "lat": lat,
        "lng": lng,
        "types": [osm_tags.get("amenity", "place"), osm_type],
        "city": props.get("city"),
        "vicinity": full_address,
        "maps_link": f"https://www.openstreetmap.org/?zoom=15&lat={lat}&lon={lng}",
        "description": None,
        "coords": {"lat": lat, "lng": lng},
        "openingHours": None,
    }


def map_place_to_card(place: Dict[str, Any], idx: int, kind: str) -> Dict[str, Any]:
    photos = place.get("photos") or []
    photo_ref = None
    if isinstance(photos, list) and photos:
        photo_ref = photos[0].get("photo_reference")
    
    # Safe extraction of location
    geometry = place.get("geometry")
    if isinstance(geometry, dict):
        loc = geometry.get("location")
        if not isinstance(loc, dict):
            loc = {}
    else:
        loc = {}

    # Safe extraction of opening hours
    opening_hours = place.get("opening_hours")
    weekday_text = None
    if isinstance(opening_hours, dict):
        weekday_text = opening_hours.get("weekday_text")

    types = place.get("types") if isinstance(place.get("types"), list) else []
    type_set = {str(t).lower() for t in types}

    resolved_kind = kind
    if kind == "general":
        if {"restaurant", "food", "cafe", "meal_takeaway", "meal_delivery"}.intersection(type_set):
            resolved_kind = "food-dining"

    formatted_address = place.get("formatted_address") or ""
    vicinity = place.get("vicinity") or ""
    city = extract_city_from_address(formatted_address or vicinity) or None

    return {
        "id": place.get("place_id") or f"g-{kind}-{idx}",
        "name": place.get("name") or "Place",
        "address": formatted_address or vicinity or "Nearby",
        "rating": place.get("rating"),
        "priceLevel": place.get("price_level"),
        "userRatingsTotal": place.get("user_ratings_total"),
        "placeId": place.get("place_id"),
        "category": resolved_kind,
        "photoUrl": build_photo_url(photo_ref),
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "types": types,
        "city": city,
        "vicinity": vicinity,
        "maps_link": f"https://www.google.com/maps/place/?q=place_id:{place.get('place_id')}" if place.get("place_id") else None,
        "description": place.get("editorial_summary", {}).get("overview") if isinstance(place.get("editorial_summary"), dict) else None,
        "coords": {"lat": loc.get("lat"), "lng": loc.get("lng")},
        "openingHours": weekday_text,
    }


def get_free_place_photo_url(place_name: str, address: str) -> str:
    """Generate a free photo URL for a place using public image APIs."""
    # Use Unsplash API (free, 50 requests/hour) with fallback to picsum.photos
    query = f"{place_name or address}".strip().replace(" ", "%20")[:100]
    if query:
        # Return Unsplash API URL for dynamic image generation
        return f"https://source.unsplash.com/800x600/?{query}"
    # Fallback to random nature/city image
    return "https://source.unsplash.com/800x600/?city"


def build_photo_url(photo_ref: Optional[str]) -> Optional[str]:
    """Deprecated: Google Photos no longer available. Return free fallback."""
    return "https://source.unsplash.com/800x600/?city"


async def fetch_place_photo_bytes(photo_reference: Optional[str], query: str = "city") -> Optional[bytes]:
    """Fetch place photo using free Unsplash API."""
    if not photo_reference and not query:
        return None
    
    search_query = query.strip().replace(" ", "%20")[:50] if query else "city"
    url = f"https://source.unsplash.com/800x600/?{search_query}"
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, follow_redirects=True)
        if res.status_code == 200:
            return res.content
    except Exception:
        pass
    
    return None


async def fetch_place_photo_by_query(query: str) -> Optional[bytes]:
    """Fetch photo for a place by search query using free Unsplash API."""
    if not query or not isinstance(query, str):
        return None
    
    search_query = query.strip().replace(" ", "%20")[:50]
    url = f"https://source.unsplash.com/800x600/?{search_query}"
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, follow_redirects=True)
        if res.status_code == 200:
            return res.content
    except Exception:
        pass
    
    return None


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c)


async def pick_suggestions(existing: List[Dict[str, Any]], candidates: List[Dict[str, Any]], flags: Dict[str, Any]) -> List[Dict[str, Any]]:
    base = [i for i in (existing or []) if i.get("status") != "suggested"]
    trip_hours_raw = flags.get("tripDurationHours") or flags.get("tripDuration") or 8
    trip_hours = float(trip_hours_raw) if isinstance(trip_hours_raw, (int, float, str)) else 8.0
    limit_override = flags.get("limit")
    if isinstance(limit_override, (int, float)):
        limit = max(10, min(20, int(limit_override)))
    else:
        limit = max(10, min(15, round(trip_hours * 1.5)))

    # Track seen xids from existing items to avoid repeats
    seen: Set[str] = set()
    for b in base:
        xid_val = b.get("xid")
        if isinstance(xid_val, str):
            seen.add(xid_val)

    # Filter to 20 km radius if distance present
    filtered: List[Dict[str, Any]] = []
    for c in candidates:
        dist_val = c.get("distanceMeters") or c.get("dist") or 0
        if dist_val and dist_val > 20000:
            continue
        xid_val = c.get("xid")
        if xid_val and xid_val in seen:
            continue
        filtered.append(c)

    def sort_key(c: Dict[str, Any]):
        rating = c.get("rating") or 0
        dist_val = c.get("distanceMeters") or c.get("travelMinutes") or c.get("dist") or 0
        return (-rating, dist_val)

    random.shuffle(filtered)
    ideas = sorted(filtered, key=sort_key)[:limit]

    # Build time slots across the day starting from now
    now = datetime.now()
    cursor = now
    mapped: List[Dict[str, Any]] = []
    for idx, c in enumerate(ideas):
        total_minutes = (c.get("dineMinutes") or 45) + (c.get("travelMinutes") or 10)
        start = cursor
        end = cursor + timedelta(minutes=total_minutes)
        time_slot = f"{start.strftime('%H:%M')} - {end.strftime('%H:%M')}"
        cursor = end
        mapped.append(
            {
                            "id": f"sg-{c.get('xid')}-{idx}-{uuid4().hex[:6]}",
                            "xid": c.get("xid"),
              "title": c.get("name"),
              "location": c.get("vicinity") or f"{round(c.get('distanceMeters') or c.get('dist') or 0)}m away",
              "timeSlot": time_slot,
              "durationMinutes": total_minutes,
              "category": (c.get("kinds") or "food").split(",")[0] or "Explore",
              "status": "suggested",
              "note": build_note(c, flags.get("behind")),
                            "reviewsSnippet": c.get("reviewsSnippet"),
            }
        )
    ai_ranked = await rerank_with_gemini(mapped, base, flags)
    return [*base, *ai_ranked]


async def rerank_with_gemini(ideas: List[Dict[str, Any]], base: List[Dict[str, Any]], flags: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not GEMINI_API_KEY:
        return ideas
    prompt_lines = [
        "You are planning a same-day itinerary (08:00-20:00).",
        f"City: {flags.get('city')}.",
        f"Traveler is {'>30 min behind' if flags.get('behind') else '>30 min ahead' if flags.get('ahead') else 'on time'}.",
    ]
    if flags.get("categoryPref") and flags.get("categoryPref") != "Any":
        prompt_lines.append(f"Prefer category: {flags['categoryPref']}.")
    if flags.get("diet") and flags.get("diet") != "Any":
        prompt_lines.append(f"Diet preference: {flags['diet']}.")
    prompt_lines.append("Existing fixed items:")
    prompt_lines.extend([f"- {b.get('timeSlot')} {b.get('title')} at {b.get('location')}" for b in base or []])
    prompt_lines.append("Candidate nearby items to rank (JSON will be returned). For each, set category that fits the traveler's mood using the review tone, and craft note to highlight why it matches the mood.")

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": "\n".join(prompt_lines)},
                    {"text": """
{
  "timeline": [
    {
      "timeSlot": "09:00 - 10:30",
      "title": "Place Name",
      "durationMinutes": 90,
      "location": "Address or Lat/Lng",
      "category": "Category",
      "note": "Why this time? (e.g. 'Low crowds predicted')",
      "crowdLevel": "Low|Medium|High|Critical"
    }
  ],
  "overflow": [ ... ],
  "analysis": "Brief summary of the optimization strategy."
}

Begin!
"""},
                    {"text": "Return a JSON array of the same objects reordered. For each object, update category to match traveler mood (Calm, Energetic, Curious, Peaceful, or similar) based on reviews. Update note to justify the mood fit using review hints and whether open now. Also, estimate crowdLevel (Low, Medium, High, Critical) based on time of day and place type. Keep ids and timeSlot fields."},
                ]
            }
        ]
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(url, json=payload)
    if res.is_error:
        return ideas
    data = res.json()
    text = None
    try:
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
    except Exception:
        text = None
    parsed = safe_json_parse(text)
    if not isinstance(parsed, list):
        return ideas
    out: List[Dict[str, Any]] = []
    for idx, p in enumerate(parsed):
        base_item = ideas[idx] if idx < len(ideas) else {}
        out.append(
            {
                "id": str(p.get("id") or base_item.get("id") or f"ai-{idx}"),
                "title": str(p.get("title") or base_item.get("title") or "Suggestion"),
                "location": str(p.get("location") or base_item.get("location") or "Nearby"),
                "timeSlot": str(p.get("timeSlot") or base_item.get("timeSlot") or "Next 60 min"),
                "durationMinutes": int(p.get("durationMinutes") or base_item.get("durationMinutes") or 45),
                "category": str(p.get("category") or base_item.get("category") or "Explore"),
                "status": "suggested",
                "note": p.get("note") if isinstance(p.get("note"), str) else base_item.get("note") or "AI-ranked",
            }
        )
    return out


def safe_json_parse(text: Optional[str]) -> Any:
    if not text:
        return None
    try:
        import json

        return json.loads(text)
    except Exception:
        return None


def guess_must_try_from_reviews(reviews: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    if not isinstance(reviews, list):
        return None
    texts = [r.get("text") for r in reviews[:5] if isinstance(r.get("text"), str) and r.get("text")]
    merged = " ".join(texts).lower()
    if not merged:
        return None
    cleaned = "".join(ch if ch.isalpha() or ch.isspace() else " " for ch in merged)
    tokens = [w for w in cleaned.split() if len(w) > 3 and w not in STOP_WORDS]
    counts: Dict[str, int] = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1
    if not counts:
        return None
    top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[0]
    if top[1] < 2:
        return None
    return f"Most mentioned: {top[0].capitalize()}"


STOP_WORDS = {
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "were",
    "have",
    "had",
    "good",
    "great",
    "very",
    "really",
    "nice",
    "food",
    "dish",
    "menu",
    "place",
    "restaurant",
    "cafe",
    "coffee",
    "service",
    "staff",
    "they",
    "them",
    "also",
    "just",
    "like",
    "best",
    "much",
    "some",
    "been",
    "after",
    "before",
    "when",
    "where",
    "your",
    "ours",
    "mine",
    "their",
    "there",
    "what",
    "which",
    "super",
    "awesome",
    "amazing",
    "delicious",
    "tasty",
}


def build_note(candidate: Dict[str, Any], behind: bool) -> str:
    dist = candidate.get("distanceMeters") or candidate.get("dist")
    km = f"{round(dist/1000, 1)} km" if dist else "Nearby"
    rating = candidate.get("rating")
    rating_part = f" · {rating}★" if rating else ""
    open_now = candidate.get("openNow")
    open_part = " · Open now" if open_now else ""
    must_try = candidate.get("mustTry")
    try_part = f" · {must_try}" if must_try else ""
    pace = "Quick stop" if behind else "Leisurely stop"
    return f"{pace}{rating_part}{open_part} · {km}{try_part}"


async def upsert_triparc_plan(plan: Dict[str, Any]) -> None:
    if not plan or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
        return
    url = f"{SUPABASE_URL}/rest/v1/triparc_plans?on_conflict=id"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    record = {"id": plan.get("id") or uuid4().hex[:12], **plan}
    async with httpx.AsyncClient(timeout=12) as client:
        try:
            await client.post(url, headers=headers, json=[record])
        except Exception:
            return


async def upsert_itinerary_items(items: List[Dict[str, Any]]) -> None:
    if not items or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
        return
    url = f"{SUPABASE_URL}/rest/v1/itinerary_items?on_conflict=id"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    async with httpx.AsyncClient(timeout=12) as client:
        try:
            await client.post(url, headers=headers, json=items)
        except Exception:
            return


async def upsert_story(item: Dict[str, Any]) -> None:
    if not item or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
        return
    url = f"{SUPABASE_URL}/rest/v1/stories?on_conflict=id"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    async with httpx.AsyncClient(timeout=12) as client:
        try:
            await client.post(url, headers=headers, json=[item])
        except Exception:
            return


async def insert_reel_extraction(url_value: str, destinations: List[Dict[str, Any]], caption: str, user_id: Optional[str]) -> None:
    if not url_value or not destinations or not user_id or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
        return
    endpoint = f"{SUPABASE_URL}/rest/v1/reel_extractions?on_conflict=url"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    record: Dict[str, Any] = {
        "id": uuid4().hex[:12],
        "url": url_value,
        "destinations": destinations,
        "caption": caption,
    }
    if user_id:
        record["user_id"] = user_id
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(endpoint, headers=headers, json=[record])
        except Exception:
            return
