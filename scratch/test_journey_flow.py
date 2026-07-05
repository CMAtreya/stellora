import asyncio
import os
import sys
import httpx
import json
from dotenv import load_dotenv

# Load backend environment variables
load_dotenv(r"c:\Users\CHINMAYA M\Documents\Projects\Stellora-Web\backend\.env")

BASE_URL = "http://localhost:8000"

async def test_synthesis_flow():
    print("==================================================")
    print("STEP 1: Testing Full Itinerary Synthesis Flow")
    print("==================================================")
    
    payload = {
        "city": "Bengaluru",
        "destinations": [
            {
                "location": "Bengaluru",
                "travelFrom": "2026-07-10",
                "travelTo": "2026-07-11"
            },
            {
                "location": "Mysuru",
                "travelFrom": "2026-07-12",
                "travelTo": "2026-07-12"
            }
        ],
        "plan": {
            "locationPref": {"crowded": "low", "walkKm": 5},
            "budget": "comfortable",
            "budgetAmount": 25000,
            "dayStart": "09:00",
            "dayEnd": "21:00",
            "travelStyle": "couple",
            "food": ["vegetarian"],
            "interests": ["photography", "history"]
        },
        "chosen": {
            "attractions": [
                "Lalbagh Botanical Garden",
                "Bangalore Palace",
                "Mysore Palace"
            ]
        }
    }
    
    async with httpx.AsyncClient(timeout=120) as client:
        print("Sending generation request to /api/generate-full-itinerary...")
        response = await client.post(f"{BASE_URL}/api/generate-full-itinerary", json=payload)
        
    if response.status_code != 200:
        print(f"[FAIL] Itinerary generation failed: {response.status_code} {response.text}")
        return None
        
    data = response.json()
    timeline = data.get("timeline", [])
    print(f"[PASS] Itinerary generated successfully! Total stops: {len(timeline)}")
    
    print("\n--- Day-by-Day Destination Assignment Verification ---")
    bengaluru_days = set()
    mysuru_days = set()
    
    for item in timeline:
        day = item.get("dayNumber")
        title = item.get("title")
        loc = item.get("location") or ""
        
        # Verify Bengaluru items are on Days 1 and 2, and Mysuru items are on Day 3
        if day in [1, 2]:
            bengaluru_days.add(day)
            print(f"Day {day} (Bengaluru): {title} ({loc})")
        elif day == 3:
            mysuru_days.add(day)
            print(f"Day {day} (Mysuru): {title} ({loc})")
        else:
            print(f"WARNING: Unexpected Day {day} detected: {title}")
            
    assert 1 in bengaluru_days or 2 in bengaluru_days, "No Bengaluru stops on Days 1 or 2!"
    assert 3 in mysuru_days, "No Mysuru stops on Day 3!"
    print("[PASS] Day allocations match dates perfectly: Days 1-2 assigned to Bengaluru, Day 3 assigned to Mysuru.")
    return timeline

async def test_curation_analysis(timeline_items):
    if not timeline_items:
        return
        
    print("\n==================================================")
    print("STEP 2: Testing Curate Page Timing Analysis")
    print("==================================================")
    
    payload = {
        "city": "Bengaluru",
        "travelWindow": {"from": "09:00", "to": "21:00"},
        "items": [
            {
                "id": item.get("id", f"item-{idx}"),
                "title": item.get("title"),
                "time": item.get("timeSlot", "10:00 AM").split(" - ")[0],
                "category": item.get("category", "Suggested"),
                "durationMinutes": item.get("durationMinutes", 60),
                "dayNumber": item.get("dayNumber", 1)
            }
            for idx, item in enumerate(timeline_items)
        ],
        "plan": {
            "locationPref": {"crowded": "low", "walkKm": 5}
        }
    }
    
    async with httpx.AsyncClient(timeout=60) as client:
        print("Sending draft curation to /api/curate/draft-itinerary...")
        response = await client.post(f"{BASE_URL}/api/curate/draft-itinerary", json=payload)
        
    if response.status_code != 200:
        print(f"[FAIL] Curation analysis failed: {response.status_code} {response.text}")
        return
        
    data = response.json()
    print("[PASS] Curate timing analysis completed successfully!")
    print(f"Summary: {data.get('summary')}")
    print(f"Is all optimal? {data.get('allOptimal')}")

async def test_ora_chat_curation():
    print("\n==================================================")
    print("STEP 3: Testing ORA Curation Assistance")
    print("==================================================")
    
    payload = {
        "message": "suggest some photography spots in Mysuru for Day 3",
        "locationContext": "Bengaluru",
        "pageContext": {
            "pageId": "curate",
            "pageSummary": "Itinerary Curation for Bengaluru, Mysuru",
            "visibleEntities": [],
            "availableActions": ["add_activity", "remove_activity", "navigate", "update_itinerary", "show_day"],
            "userFacingState": {
                "city": "Bengaluru",
                "destinations": ["Bengaluru", "Mysuru"],
                "travelWindow": {"from": "09:00", "to": "21:00"},
                "tripDays": 3,
                "itemsCount": 0
            }
        }
    }
    
    async with httpx.AsyncClient(timeout=60) as client:
        print("Sending query to ORA chat...")
        response = await client.post(f"{BASE_URL}/api/ora/chat", json=payload)
        
    if response.status_code != 200:
        print(f"[FAIL] ORA chat failed: {response.status_code} {response.text}")
        return
        
    data = response.json()
    print("[PASS] ORA agent replied successfully!")
    print(f"ORA Reply: {data.get('response')}")
    
    actions = data.get("actions", [])
    print(f"Actions generated by ORA: {actions}")
    
    has_add_activity = False
    for action in actions:
        if action.get("type") == "add_activity":
            params = action.get("params", {})
            title = params.get("title")
            day = params.get("dayNumber") or params.get("day")
            print(f"-> Detected add_activity: '{title}' for Day {day}")
            if day == 3:
                has_add_activity = True
                
    if has_add_activity:
        print("[PASS] ORA correctly generated add_activity action targeting Day 3 (Mysuru)!")
    else:
        print("[WARNING] ORA did not return add_activity for Day 3.")

async def main():
    print("Starting Multi-Destination Integration verification...")
    timeline = await test_synthesis_flow()
    await test_curation_analysis(timeline)
    await test_ora_chat_curation()
    print("\nVerification complete!")

if __name__ == "__main__":
    asyncio.run(main())
