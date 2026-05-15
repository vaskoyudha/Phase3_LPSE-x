import csv
import gzip
import json
import subprocess
import sys
from pathlib import Path

from src.ocds_upload_csv import (
    UPLOAD_COLUMNS,
    convert_ocds_jsonl_to_upload_csv,
)


def _write_jsonl_gz(path, records):
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record))
            fh.write("\n")


def test_converts_ocds_jsonl_gz_to_upload_ready_csv(tmp_path):
    source = tmp_path / "2024.jsonl.gz"
    output = tmp_path / "upload-ready.csv"
    _write_jsonl_gz(
        source,
        [
            {
                "ocid": "ocds-2024-1",
                "date": "2024-02-03T16:00:00.000000Z",
                "buyer": {"id": "B1", "name": "Pemerintah Daerah Kota Surabaya"},
                "tender": {
                    "id": "T1",
                    "title": "Pembangunan Jalan",
                    "value": {"currency": "IDR"},
                    "minValue": {"amount": 1_500_000_000, "currency": "IDR"},
                    "datePublished": "2024-01-15T10:30:00.000000Z",
                    "mainProcurementCategory": "works",
                    "status": "complete",
                    "items": [
                        {
                            "id": "1",
                            "classification": {"description": "Pekerjaan Konstruksi"},
                        }
                    ],
                },
                "awards": [
                    {
                        "id": "A1",
                        "date": "2024-02-20T16:00:00.000000Z",
                        "value": {"amount": 1_480_000_000, "currency": "IDR"},
                        "suppliers": [{"id": "S1", "name": "PT Maju Jaya"}],
                    }
                ],
            }
        ],
    )

    stats = convert_ocds_jsonl_to_upload_csv(source, output)

    assert stats.rows_written == 1
    assert stats.rows_skipped == 0
    with output.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)

    assert reader.fieldnames == UPLOAD_COLUMNS
    assert rows == [
        {
            "ocid": "ocds-2024-1",
            "tender_id": "T1",
            "tender_title": "Pembangunan Jalan",
            "tender_description": "Pekerjaan Konstruksi",
            "buyer_id": "B1",
            "buyer_name": "Pemerintah Daerah Kota Surabaya",
            "supplier_id": "S1",
            "supplier_name": "PT Maju Jaya",
            "tender_value_amount": "1500000000",
            "award_value_amount": "1480000000",
            "currency": "IDR",
            "tender_datePublished": "2024-01-15",
            "award_date": "2024-02-20",
            "tender_procurementMethod": "open",
            "tender_mainProcurementCategory": "works",
            "tender_status": "complete",
        }
    ]


def test_skips_rows_that_cannot_satisfy_required_upload_fields(tmp_path):
    source = tmp_path / "missing-award.jsonl.gz"
    output = tmp_path / "upload-ready.csv"
    _write_jsonl_gz(
        source,
        [
            {
                "ocid": "ocds-2024-no-award",
                "buyer": {"id": "B1", "name": "Pemerintah Daerah Kota Surabaya"},
                "tender": {
                    "id": "T1",
                    "title": "Paket tanpa award",
                    "minValue": {"amount": 1_500_000_000, "currency": "IDR"},
                    "datePublished": "2024-01-15T10:30:00.000000Z",
                    "mainProcurementCategory": "works",
                    "status": "complete",
                },
                "awards": [],
            }
        ],
    )

    stats = convert_ocds_jsonl_to_upload_csv(source, output)

    assert stats.rows_written == 0
    assert stats.rows_skipped == 1
    with output.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        assert reader.fieldnames == UPLOAD_COLUMNS
        assert list(reader) == []


def test_prepare_script_runs_from_repo_root(tmp_path):
    source = tmp_path / "2024.jsonl.gz"
    output = tmp_path / "upload-ready.csv"
    _write_jsonl_gz(
        source,
        [
            {
                "ocid": "ocds-2024-1",
                "date": "2024-02-03T16:00:00.000000Z",
                "buyer": {"id": "B1", "name": "Pemerintah Daerah Kota Surabaya"},
                "tender": {
                    "id": "T1",
                    "title": "Pembangunan Jalan",
                    "minValue": {"amount": 1_500_000_000, "currency": "IDR"},
                    "datePublished": "2024-01-15T10:30:00.000000Z",
                    "mainProcurementCategory": "works",
                    "status": "complete",
                },
                "awards": [
                    {
                        "id": "A1",
                        "date": "2024-02-20T16:00:00.000000Z",
                        "value": {"amount": 1_480_000_000, "currency": "IDR"},
                        "suppliers": [{"id": "S1", "name": "PT Maju Jaya"}],
                    }
                ],
            }
        ],
    )
    repo_root = Path(__file__).resolve().parents[1]

    result = subprocess.run(
        [
            sys.executable,
            "scripts/prepare_ocds_upload_csv.py",
            "--input",
            str(source),
            "--output",
            str(output),
        ],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        "records_read": 1,
        "rows_skipped": 0,
        "rows_written": 1,
    }
    assert output.exists()
