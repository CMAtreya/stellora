#!/usr/bin/env python3
"""Test integration of all critical API endpoints"""
import httpx
import json
import sys

BASE_URL = "http://localhost:8000"
HEADERS = {"User-Agent": "Stellora-Integration-Test/1.0"}

def test_endpoint(method: str, path: str, data: dict = None, name: str = "") -> tuple[bool, str]:
    """Test a single endpoint and return success status and response"""
    url = f"{BASE_URL}{path}"
    try:
        if method == "GET":
            r = httpx.get(url, headers=HEADERS, timeout=10)
        else:
            r = httpx.post(url, json=data, headers=HEADERS, timeout=10)
        
        if r.status_code >= 200 and r.status_code < 300:
            return True, f"[PASS] {name or path}: {r.status_code} OK"
        else:
            return False, f"[FAIL] {name or path}: {r.status_code} {r.text[:100]}"
    except Exception as e:
        return False, f"[FAIL] {name or path}: {str(e)[:100]}"

# Test suite
tests = [
    ("GET", "/api/search-place?query=Paris", None, "search-place"),
    ("GET", "/api/verify-place?query=Paris&lat=48.85&lng=2.35", None, "verify-place"),
    ("POST", "/api/weather-hint", {"city": "Paris", "lat": 48.85, "lng": 2.35}, "weather-hint"),
    ("POST", "/api/discover-city", {"city": "Paris", "preferences": {"pace": "relaxed"}}, "discover-city"),
    ("GET", "/api/best-visit-month?city=Paris", None, "best-visit-month"),
    ("GET", "/openapi.json", None, "openapi.json"),
]

print("=" * 60)
print("STELLORA API INTEGRATION TEST SUITE")
print("=" * 60)

passed = 0
failed = 0

for method, path, data, name in tests:
    success, message = test_endpoint(method, path, data, name)
    print(message)
    if success:
        passed += 1
    else:
        failed += 1

print("=" * 60)
print(f"RESULTS: {passed} passed, {failed} failed")
print("=" * 60)

sys.exit(0 if failed == 0 else 1)
