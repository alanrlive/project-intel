# test_chat.py
import requests

BASE_URL = "http://localhost:8000"

print("=== Testing Q&A Chat ===\n")

questions = [
    "What are the high priority actions?",
    "What are the biggest risks?",
    "When is the project kickoff?",
    "What's blocking the vendor contract?"
]

for i, question in enumerate(questions, 1):
    print(f"{i}. Question: {question}")
    response = requests.post(
        f"{BASE_URL}/query",
        json={"question": question}
    )
    
    if response.status_code == 200:
        answer = response.json()
        print(f"   Answer: {answer.get('answer', 'No answer')}\n")
    else:
        print(f"   Error: {response.status_code}\n")
        