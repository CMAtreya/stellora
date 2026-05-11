import requests
import json

url = "http://127.0.0.1:8000/api/extract-reel"
payload = {"url": "https://www.instagram.com/reel/DD1_j02SqH0"}

try:
    print("Sending POST request to", url)
    res = requests.post(url, json=payload, timeout=60)
    print("Status code:", res.status_code)
    try:
        print("Response JSON:", res.json())
    except:
        print("Response Text:", res.text)
except Exception as e:
    print("Request failed:", e)
