
from src.casebook import generate_demo_casebook

print("Testing Task 3: Casebook builder...")
payload, html_path = generate_demo_casebook()
print(f"✅ Casebook payload generated successfully!")
print(f"✅ Static HTML saved to: {html_path}")
print("\nPayload keys:")
print(list(payload.keys()))

with open('test_task3_result.txt', 'w', encoding='utf-8') as f:
    f.write("Testing Task 3: Casebook builder...\n")
    f.write(f"✅ Casebook payload generated successfully!\n")
    f.write(f"✅ Static HTML saved to: {html_path}\n")
    f.write("\nPayload keys:\n")
    for key in sorted(payload.keys()):
        f.write(f"- {key}\n")
    f.write("\n=== Payload Snippet ===\n")
    import json
    f.write(json.dumps(payload, ensure_ascii=False, indent=2, default=str)[:5000] + "\n...")

print("\nFull output saved to test_task3_result.txt")
