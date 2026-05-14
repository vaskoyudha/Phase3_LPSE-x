from io import StringIO

import pandas as pd
import pytest

from src.uploaded_packages import (
    EVAL_CLAIM_SCOPE,
    OPTIONAL_COLUMNS,
    REQUIRED_COLUMNS,
    SOURCE_SPLIT,
    TEMPLATE_COLUMNS,
    UploadedPackageValidationError,
    generate_template_csv,
    build_uploaded_package_scores,
    normalize_uploaded_rows,
    parse_uploaded_csv,
    validate_uploaded_frame,
)

VALID_CSV = """tender_title,tender_description,buyer_name,supplier_name,tender_value_amount,award_value_amount,tender_datePublished,tender_procurementMethod,tender_mainProcurementCategory,ocid,tender_id,buyer_id,supplier_id,tender_status,award_date,currency
Pembangunan jalan desa,Paket pekerjaan konstruksi jalan desa,Dinas PUPR Kabupaten Sleman,PT Maju Jaya,1500000000,1480000000,2025-01-15,open,works,ocds-upload-1,TDR-1,BYR-1,SUP-1,complete,2025-02-20,IDR
Pengadaan laptop sekolah,Pengadaan perangkat laptop untuk sekolah,Dinas Pendidikan Kota Bandung,CV Teknologi Nusantara,750000000,760000000,2025-02-11,open,goods,ocds-upload-2,TDR-2,BYR-2,SUP-2,complete,2025-03-10,IDR
"""


def test_template_csv_contains_required_and_optional_columns():
    template = generate_template_csv()
    frame = pd.read_csv(StringIO(template), dtype=str, keep_default_na=False)

    assert list(frame.columns) == TEMPLATE_COLUMNS
    assert list(frame.columns) == REQUIRED_COLUMNS + OPTIONAL_COLUMNS
    assert len(frame) == 1


def test_parse_and_validate_valid_csv():
    frame = parse_uploaded_csv(VALID_CSV.encode("utf-8"))

    validate_uploaded_frame(frame)

    assert list(frame.columns) == TEMPLATE_COLUMNS
    assert len(frame) == 2


def test_missing_required_column_returns_actionable_error():
    frame = parse_uploaded_csv(VALID_CSV.encode("utf-8")).drop(columns=["buyer_name"])

    with pytest.raises(UploadedPackageValidationError) as exc_info:
        validate_uploaded_frame(frame)

    assert exc_info.value.detail == {
        "error": "missing_required_columns",
        "missing_columns": ["buyer_name"],
    }


def test_invalid_numeric_field_returns_row_specific_error():
    frame = parse_uploaded_csv(VALID_CSV.encode("utf-8"))
    frame.loc[1, "award_value_amount"] = "not-a-number"

    with pytest.raises(UploadedPackageValidationError) as exc_info:
        validate_uploaded_frame(frame)

    assert exc_info.value.detail == {
        "error": "invalid_numeric_fields",
        "fields": [{"column": "award_value_amount", "rows": [3]}],
    }


def test_invalid_date_field_returns_row_specific_error():
    frame = parse_uploaded_csv(VALID_CSV.encode("utf-8"))
    frame.loc[0, "tender_datePublished"] = "not-a-date"

    with pytest.raises(UploadedPackageValidationError) as exc_info:
        validate_uploaded_frame(frame)

    assert exc_info.value.detail == {
        "error": "invalid_date_fields",
        "fields": [{"column": "tender_datePublished", "rows": [2]}],
    }


def test_normalize_uploaded_rows_adds_upload_provenance_and_raw_defaults():
    frame = parse_uploaded_csv(VALID_CSV.encode("utf-8"))
    frame = frame.drop(columns=["ocid", "tender_id", "award_date", "currency"])
    normalized = normalize_uploaded_rows(frame)

    assert normalized.index.tolist() == [0, 1]
    assert normalized["ocid"].tolist() == ["uploaded-1", "uploaded-2"]
    assert normalized["tender_id"].tolist() == ["UPLOAD-1", "UPLOAD-2"]
    assert normalized["currency"].tolist() == ["IDR", "IDR"]
    assert normalized["tender_value_amount"].tolist() == [1500000000, 750000000]
    assert normalized["award_value_amount"].tolist() == [1480000000, 760000000]
    assert normalized["tender_value_currency"].tolist() == ["IDR", "IDR"]
    assert normalized["award_value_currency"].tolist() == ["IDR", "IDR"]
    assert normalized["tender_items_count"].tolist() == [1, 1]
    assert normalized["award_items_count"].tolist() == [1, 1]
    assert normalized["award_status"].tolist() == ["complete", "complete"]
    assert normalized["contract_value_amount"].tolist() == [1480000000, 760000000]
    assert normalized["contract_dateSigned"].tolist() == ["", ""]
    assert normalized["source_split"].tolist() == [SOURCE_SPLIT, SOURCE_SPLIT]
    assert normalized["eval_claim_scope"].tolist() == [EVAL_CLAIM_SCOPE, EVAL_CLAIM_SCOPE]
    assert normalized["is_heldout"].tolist() == [False, False]

def test_build_uploaded_package_scores_returns_ranked_uploaded_rows():
    result = build_uploaded_package_scores(VALID_CSV.encode("utf-8"))

    assert result.metadata.source_split == SOURCE_SPLIT
    assert result.metadata.eval_claim_scope == EVAL_CLAIM_SCOPE
    assert result.metadata.rows_received == 2
    assert result.metadata.rows_scored == 2
    assert result.metadata.no_retraining is True
    assert result.metadata.no_cloud_call is True
    assert result.metadata.no_live_scraping is True
    assert len(result.items) == 2
    assert result.items[0]["source_split"] == SOURCE_SPLIT
    assert result.items[0]["eval_claim_scope"] == EVAL_CLAIM_SCOPE
    assert result.items[0]["is_heldout"] is False
    assert result.items[0]["risk_rank"] == 1
    assert {"probability_low", "probability_medium", "probability_high"} <= set(result.items[0])

def test_uploaded_features_align_with_model_feature_names():
    result = build_uploaded_package_scores(VALID_CSV.encode("utf-8"))

    assert result.feature_columns
    assert set(result.model_feature_names).issubset(set(result.feature_columns))
