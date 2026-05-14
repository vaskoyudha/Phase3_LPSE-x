
from src.reviews import ReviewStore, REVIEW_STATUSES, _draft_review

print("Testing Task 5: SQLite review store...")
print(f"Review statuses available: {REVIEW_STATUSES}")

# Initialize review store
store = ReviewStore()

# Test draft review
print("\nTesting _draft_review:")
draft = _draft_review("CASE-001")
print(draft)

# Test upsert review
print("\nTesting upsert_review:")
review = store.upsert_review(
    case_id="CASE-001",
    status="Perlu Review",
    reviewer_name="Reviewer A",
    notes="Paket ini perlu dicek nilai tender",
)
print(f"Upserted review: {review.case_id}, status: {review.status}")

# Test get review
print("\nTesting get_review:")
retrieved = store.get_review("CASE-001")
print(f"Retrieved review: {retrieved.case_id}, notes: {retrieved.notes}")

# Test list reviews
print("\nTesting list_reviews:")
reviews = store.list_reviews()
print(f"Number of reviews: {len(reviews)}")

print("\n✅ Task 5 test completed successfully!")
