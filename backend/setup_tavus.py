import requests

TAVUS_API_KEY = "6eb6baaaadeb4054bc7ae149915b17b9"
BASE_URL = "https://tavusapi.com"
HEADERS = {
    "x-api-key": TAVUS_API_KEY,
    "Content-Type": "application/json"
}

def list_stock_replicas():
    """Get free stock replicas"""
    resp = requests.get(f"{BASE_URL}/v2/replicas?verbose=true", headers=HEADERS)
    resp.raise_for_status()
    replicas = resp.json().get("data", [])
    stock = [r for r in replicas if r.get("replica_type") == "system"]

    print("Available FREE Stock Replicas:")
    for r in stock[:10]:
        print(f"  ID: {r['replica_id']} — Name: {r['replica_name']}")

    return stock[0]['replica_id'] if stock else None

def create_livekit_persona():
    """Create persona for LiveKit"""
    payload = {
        "persona_name": "Emirati AI Kiosk",
        "pipeline_mode": "echo",
        "layers": {
            "transport": {
                "transport_type": "livekit"
            }
        }
    }
    resp = requests.post(f"{BASE_URL}/v2/personas", json=payload, headers=HEADERS)
    resp.raise_for_status()
    data = resp.json()
    print(f"\nPersona created: {data['persona_id']}")
    return data['persona_id']

if __name__ == "__main__":
    replica_id = list_stock_replicas()
    persona_id = create_livekit_persona()

    print("\n" + "="*50)
    print("ADD THESE TO YOUR .env.local:")
    print("="*50)
    print(f"TAVUS_REPLICA_ID={replica_id}")
    print(f"TAVUS_PERSONA_ID={persona_id}")
