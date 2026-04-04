# test_backend.py
import requests
import json

BASE_URL = "http://localhost:8000"

print("=== Project Intel V2 - Backend Test ===\n")

# 1. Upload document
print("1. Uploading test document...")
with open("meeting_notes.md", "rb") as f:
    files = {"file": f}
    data = {"doc_type": "meeting_notes"}
    response = requests.post(f"{BASE_URL}/documents/upload", files=files, data=data)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}\n")

# 2. Check extracted actions
print("2. Checking extracted actions...")
response = requests.get(f"{BASE_URL}/actions")
actions = response.json()
print(f"   Found {len(actions)} actions:")
for action in actions:
    print(f"   - {action['description']} (Due: {action['due_date']}, Priority: {action['priority']})")
print()

# 3. Check extracted risks
print("3. Checking extracted risks...")
response = requests.get(f"{BASE_URL}/risks")
risks = response.json()
print(f"   Found {len(risks)} risks:")
for risk in risks:
    print(f"   - {risk['description']} (Impact: {risk['impact']}, Likelihood: {risk['likelihood']})")
print()

# 4. Check deadlines
print("4. Checking deadlines...")
response = requests.get(f"{BASE_URL}/deadlines")
deadlines = response.json()
print(f"   Found {len(deadlines)} deadlines:")
for deadline in deadlines:
    print(f"   - {deadline['description']} (Date: {deadline['deadline_date']})")
print()

# 5. Generate notification briefing
print("5. Generating notification briefing...")
requests.post(f"{BASE_URL}/notifications/refresh")
response = requests.get(f"{BASE_URL}/notifications")
notifications = response.json()
print(f"   Generated {len(notifications)} notifications:")
for notif in notifications:
    print(f"   [{notif['severity']}] {notif['message']}")
print()

# 6. Ask a question
print("6. Testing Q&A...")
response = requests.post(
    f"{BASE_URL}/query",
    json={"question": "What are the high priority actions?"}
)
answer = response.json()
print(f"   Answer: {answer['answer']}\n")

print("=== Test Complete ===")