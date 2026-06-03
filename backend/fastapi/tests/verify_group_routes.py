import argparse
import json
from pathlib import Path
from typing import List, Tuple

import httpx


def decode_polyline(encoded: str) -> List[Tuple[float, float]]:
    coords: List[Tuple[float, float]] = []
    index = 0
    lat = 0
    lng = 0

    while index < len(encoded):
        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        delta_lat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += delta_lat

        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        delta_lng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += delta_lng

        coords.append((lat / 1e5, lng / 1e5))

    return coords


def build_html(route_points: List[Tuple[float, float]], out_file: Path) -> None:
    if not route_points:
        raise ValueError("No route points available")

    center = route_points[len(route_points) // 2]
    points_json = json.dumps([[lat, lng] for lat, lng in route_points])

    html = f"""<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
  <title>Group Route Preview</title>
  <link rel=\"stylesheet\" href=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\" />
  <style>
    html, body, #map {{ height: 100%; margin: 0; background: #0f172a; }}
    .panel {{ position: absolute; top: 10px; left: 10px; z-index: 999; background: rgba(15,23,42,0.9); color: #fff; padding: 10px 12px; border-radius: 12px; font-family: ui-sans-serif, system-ui; font-size: 13px; }}
  </style>
</head>
<body>
  <div class=\"panel\">Stellora Group Route Preview</div>
  <div id=\"map\"></div>
  <script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script>
  <script>
    const points = {points_json};
    const map = L.map('map').setView([{center[0]}, {center[1]}], 14);
    L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{ maxZoom: 19 }}).addTo(map);
    const poly = L.polyline(points, {{ color: '#ff7a59', weight: 5, opacity: 0.9 }}).addTo(map);
    L.marker(points[0]).addTo(map).bindPopup('Origin');
    L.marker(points[points.length - 1]).addTo(map).bindPopup('Destination');
    map.fitBounds(poly.getBounds(), {{ padding: [30, 30] }});
  </script>
</body>
</html>"""

    out_file.write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Exercise group endpoints and generate a static route preview map.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="FastAPI base URL")
    parser.add_argument("--output", default="group_route_preview.html", help="Output HTML file path")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    output_path = Path(args.output).resolve()

    with httpx.Client(timeout=20.0) as client:
        create = client.post(f"{base_url}/api/groups/create", json={"name": "Route Verify Group"})
        create.raise_for_status()
        create_data = create.json()

        group_code = create_data["group_code"]
        group_id = create_data["group_id"]

        join_a = client.post(f"{base_url}/api/groups/join", json={"group_code": group_code, "user_id": "verify-user-a", "display_name": "Verifier A"})
        join_b = client.post(f"{base_url}/api/groups/join", json={"group_code": group_code, "user_id": "verify-user-b", "display_name": "Verifier B"})
        join_a.raise_for_status()
        join_b.raise_for_status()

        # Midtown Manhattan sample points for deterministic route output
        client.post(
            f"{base_url}/api/groups/update-location",
            json={"group_id": group_id, "user_id": "verify-user-a", "lat": 40.7484, "lng": -73.9857, "accuracy": 15},
        ).raise_for_status()
        client.post(
            f"{base_url}/api/groups/update-location",
            json={"group_id": group_id, "user_id": "verify-user-b", "lat": 40.7527, "lng": -73.9772, "accuracy": 15},
        ).raise_for_status()

        route = client.post(
            f"{base_url}/api/groups/route",
            json={
                "origin": {"lat": 40.7484, "lng": -73.9857},
                "destination": {"lat": 40.7527, "lng": -73.9772},
                "profile": "walking",
            },
        )
        route.raise_for_status()
        route_data = route.json()

    geometry = route_data.get("geometry")
    if not geometry:
        raise RuntimeError("Route endpoint returned no geometry")

    points = decode_polyline(geometry)
    build_html(points, output_path)

    print("Route endpoint check passed")
    print(f"Group ID: {group_id}")
    print(f"Distance: {route_data.get('distance')}")
    print(f"Duration: {route_data.get('duration')}")
    print(f"Wrote map preview: {output_path}")


if __name__ == "__main__":
    main()
