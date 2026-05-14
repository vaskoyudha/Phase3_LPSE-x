"""Source-specific evidence import helpers for Indonesian official/public records."""

from __future__ import annotations

from typing import Callable

from .kpk_procurement_case import transform_kpk_procurement_case_records
from .kpk_ppid_report import transform_kpk_ppid_report_records
from .lkpp_inaproc_blacklist import transform_lkpp_inaproc_blacklist_records

SourceTransformer = Callable[[list[dict]], list[dict]]

SOURCE_TRANSFORMERS: dict[str, SourceTransformer] = {
    "generic": lambda records: records,
    "lkpp_inaproc_blacklist": transform_lkpp_inaproc_blacklist_records,
    "kpk_procurement_case": transform_kpk_procurement_case_records,
    "kpk_ppid_report": transform_kpk_ppid_report_records,
}


__all__ = [
    "SOURCE_TRANSFORMERS",
    "SourceTransformer",
    "transform_kpk_procurement_case_records",
    "transform_kpk_ppid_report_records",
    "transform_lkpp_inaproc_blacklist_records",
]
