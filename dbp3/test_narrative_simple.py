
from src.narrative import (
    _feature_label,
    _factor_title,
    _factor_reason,
    _factor_review_check,
    _impact_label,
    _confidence_label,
    derive_business_rating,
    render_factor_sentence,
    build_explanation_brief,
    render_explanation_narrative,
)

# Test data
test_explanation = {
    "predicted_class": 2,
    "predicted_label": "Risiko Tinggi",
    "probability": 0.87,
    "factors": [
        {"feature": "f_tender_value_log", "shap_value": 0.35, "feature_value": 19.2},
        {"feature": "f_price_deviation_ratio", "shap_value": 0.28, "feature_value": 1.3},
        {"feature": "f_buyer_supplier_repeat_count", "shap_value": 0.15, "feature_value": 5},
        {"feature": "f_supplier_recent_90d_award_count", "shap_value": -0.10, "feature_value": 2},
    ],
}

print("Testing _feature_label:")
print(f"f_tender_value_log → {_feature_label('f_tender_value_log')}")
print(f"f_price_deviation_ratio → {_feature_label('f_price_deviation_ratio')}")
print(f"f_buyer_supplier_repeat_count → {_feature_label('f_buyer_supplier_repeat_count')}")
print(f"f_supplier_recent_90d_award_count → {_feature_label('f_supplier_recent_90d_award_count')}")
print()

print("Testing render_factor_sentence:")
for factor in test_explanation["factors"]:
    print(f"- {render_factor_sentence(factor)}")
print()

print("Testing build_explanation_brief:")
brief = build_explanation_brief(test_explanation)
print(brief["summary"])
print()

print("Testing render_explanation_narrative:")
narrative = render_explanation_narrative(test_explanation)
print(narrative)
