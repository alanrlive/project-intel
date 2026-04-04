"""
Standalone smoke test for Ollama integration.
Run from the backend directory with the venv active:

    python test_ollama.py

Does NOT require the FastAPI server to be running.
"""

import asyncio
import json
import sys

from app.llm_service import OllamaService, OllamaUnavailableError


async def main():
    svc = OllamaService()

    print("=" * 60)
    print("Project Intel V2 — Ollama smoke test")
    print("=" * 60)

    # ── 1. Health check ───────────────────────────────────────────
    print("\n[1/4] Health check...")
    healthy = await svc.check_health()
    if not healthy:
        print("  FAIL  Ollama is not running.")
        print("        Start it with: ollama serve")
        sys.exit(1)
    print("  OK    Ollama is reachable.")

    # ── 2. List models ────────────────────────────────────────────
    print("\n[2/4] Available models...")
    names = await svc.list_model_names()
    if not names:
        print("  WARN  No models found. Pull at least one:")
        print("        ollama pull llama3.1")
        sys.exit(1)
    for name in names:
        print(f"  *  {name}")

    # ── 3. Status report (configured model readiness) ─────────────
    print("\n[3/4] Configured model status...")
    report = await svc.status_report()
    for role, ready in report["models_ready"].items():
        model = report["configured_models"][role]
        mark = "OK  " if ready else "WARN"
        print(f"  {mark}  {role:12s} -> {model}")
    if report.get("pull_commands"):
        print("\n  To install missing models:")
        for cmd in report["pull_commands"]:
            print(f"    {cmd}")

    # ── 4. Quick generation test ──────────────────────────────────
    # Pick the first available configured model
    test_model = next(
        (m for m in [
            report["configured_models"]["qa"],
            report["configured_models"]["extraction"],
            report["configured_models"]["reasoning"],
        ] if m in names),
        names[0],
    )

    print(f"\n[4/4] Generation test with {test_model}...")
    prompt = (
        'Return ONLY valid JSON with key "answer" set to the string "working". '
        "No explanation, no markdown."
    )
    try:
        raw = await svc.generate(
            model=test_model, prompt=prompt, format="json", temperature=0.0
        )
        parsed = json.loads(raw)
        if parsed.get("answer") == "working":
            print(f"  OK    JSON generation works. Response: {parsed}")
        else:
            print(f"  WARN  Unexpected response (model may vary): {parsed}")
    except OllamaUnavailableError as exc:
        print(f"  FAIL  {exc}")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"  WARN  Model returned non-JSON (try again): {raw[:200]}")

    print("\n" + "=" * 60)
    print("Smoke test complete.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
