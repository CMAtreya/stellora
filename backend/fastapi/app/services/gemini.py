import os
from google import genai

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

PROMPT = """
You are an information extraction engine.

Extract place details from this text.
Return JSON:
{
  "place_detected": true/false,
  "place_name": "",
  "city": "",
  "category": ""
}
TEXT:
"""

async def extract_place(text: str):
    response = client.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents=PROMPT + text
    )
    return response.text
