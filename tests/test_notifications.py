# test_notifications.py
import requests

BASE_URL = "http://localhost:8000"

print("=== Testing Notification System ===\n")

# Generate briefing
print("1. Generating notification briefing...")
response = requests.post(f"{BASE_URL}/notifications/refresh")
print(f"   Status: {response.status_code}\n")

# Get notifications
print("2. Fetching notifications...")
response = requests.get(f"{BASE_URL}/notifications")
notifications = response.json()

print(f"   Found {len(notifications)} notifications:\n")

# Handle both list and dict responses
if isinstance(notifications, list):
    for notif in notifications:
        severity = notif.get('severity', 'unknown')
        message = notif.get('message', 'no message')
        print(f"   [{severity.upper()}] {message}")
else:
    print(f"   Response: {notifications}")