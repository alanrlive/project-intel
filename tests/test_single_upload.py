# tests/test_single_upload.py
import requests
import sys
from pathlib import Path

# Add backend to path for imports if needed
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

BASE_URL = "http://localhost:8000"
TEST_FILE = Path(__file__).parent / "test_data" / "meeting_notes_simple.md"

print("Uploading test document...")
with open(TEST_FILE, "rb") as f:
    files = {"file": f}
    data = {"doc_type": "meeting_notes"}
    response = requests.post(f"{BASE_URL}/documents/upload", files=files, data=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}\n")

print("Checking actions...")
response = requests.get(f"{BASE_URL}/actions")
actions = response.json()
print(f"Found {len(actions)} actions (expected: 2)")
for action in actions:
    print(f"  - {action['description']}")

print("\nChecking risks...")
response = requests.get(f"{BASE_URL}/risks")
risks = response.json()
print(f"Found {len(risks)} risks (expected: 2)")
for risk in risks:
    print(f"  - {risk['description']}")

print("\nChecking deadlines...")
response = requests.get(f"{BASE_URL}/deadlines")
deadlines = response.json()
print(f"Found {len(deadlines)} deadlines (expected: 2)")
for deadline in deadlines:
    print(f"  - {deadline['description']} on {deadline['deadline_date']}")