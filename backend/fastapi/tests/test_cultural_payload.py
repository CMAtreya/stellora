import pytest

from main import translator_cultural, CulturalIntelPayload


@pytest.mark.asyncio
async def test_cultural_payload_fallback(monkeypatch):
    # Force gemini to be unavailable so fallback profile is used
    async def noop_gemini(location, situation, profile):
        return None

    monkeypatch.setattr('main._gemini_cultural_intel', noop_gemini)

    result = await translator_cultural(situation='general', lat=None, lng=None)
    assert isinstance(result, CulturalIntelPayload)
    data = result.model_dump()
    assert isinstance(data.get('title'), str) and data.get('title')
    assert isinstance(data.get('locationLabel'), str)
    assert isinstance(data.get('situation'), str)
    assert isinstance(data.get('rituals'), list)
    assert isinstance(data.get('rules'), list)
    assert isinstance(data.get('regulations'), list)
    assert isinstance(data.get('tips'), list)
    confidence = data.get('confidence')
    assert isinstance(confidence, float)
    assert 0.0 <= confidence <= 1.0
