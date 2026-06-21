import sys
import traceback
import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
from app.services.instagram import get_instagram_caption
from app.services.gemini import extract_place

async def test():
    try:
        cap = await get_instagram_caption('https://www.instagram.com/reel/C8qLd94P5P9/')
        res = await extract_place(cap)
        with open('error.txt', 'w') as f:
            f.write(f"SUCCESS: {res}")
    except Exception as e:
        with open('error.txt', 'w') as f:
            f.write(traceback.format_exc())

asyncio.run(test())
