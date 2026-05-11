import httpx
from bs4 import BeautifulSoup
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}


def clean_instagram_caption_text(text: str) -> str:
    if not text:
        return ""

    cleaned = text.replace("\r\n", "\n").strip()

    # Remove the common Instagram metadata prefix: likes, comments, username, date.
    cleaned = re.sub(
        r"^\s*[\d,\.]+\s+likes?,\s*[\d,\.]+\s+comments?\s*-\s*[^:]+:\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    # If the remaining text is wrapped in a leading quote, drop it.
    cleaned = cleaned.lstrip('"“')
    cleaned = cleaned.rstrip('"”')

    # Remove any duplicated metadata line that can survive on the first line.
    lines = [line.strip() for line in cleaned.splitlines()]
    lines = [line for line in lines if line]
    if lines and re.search(r"likes?,\s*[\d,\.]+\s+comments?", lines[0], re.IGNORECASE):
        lines = lines[1:]

    return "\n".join(lines).strip()

async def get_instagram_caption(url: str):
    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, headers=HEADERS)

    soup = BeautifulSoup(response.text, "html.parser")

    description = soup.find("meta", property="og:description")
    title = soup.find("meta", property="og:title")

    caption = ""

    if description:
        caption += description["content"] + "\n"

    if title:
        caption += title["content"]

    return clean_instagram_caption_text(caption)
