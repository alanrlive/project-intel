# test_crud.py
import requests

BASE_URL = "http://localhost:8000"

print("=== Testing CRUD Operations ===\n")

# Get all actions
print("1. Current actions:")
response = requests.get(f"{BASE_URL}/actions")
actions = response.json()
for action in actions:
    print(f"   ID {action['id']}: {action['description']} - Status: {action['status']}")

# Mark first action as complete
if actions:
    action_id = actions[0]['id']
    print(f"\n2. Marking action {action_id} as 'done'...")
    
    response = requests.patch(
        f"{BASE_URL}/actions/{action_id}",
        json={"status": "done"}
    )
    print(f"   Status: {response.status_code}")
    
    # Check updated status
    print("\n3. Updated actions:")
    response = requests.get(f"{BASE_URL}/actions")
    actions = response.json()
    for action in actions:
        status_emoji = "✅" if action['status'] == 'done' else "⏳"
        print(f"   {status_emoji} ID {action['id']}: {action['description']} - Status: {action['status']}")