
from src.casebook import generate_demo_casebook

print("Testing Task 3: Casebook builder...")
payload, html_path = generate_demo_casebook()
print(f"✅ Casebook payload generated successfully!")
print(f"✅ Static HTML saved to: {html_path}")
print("\nPayload keys:")
print(list(payload.keys()))
