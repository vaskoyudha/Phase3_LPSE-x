"""Apply concentration-grouping fix to lpseN-product/src/api.py.

Replaces the pandas group-by snippet that broke when label_column ==
key_column with one that drops the duplicate from the group key.
"""

from pathlib import Path

target = Path("/home/jajang/project/lpseN-product/src/api.py")
text = target.read_text(encoding="utf-8")

OLD = """    grouped = (
        df.groupby([label_column, key_column], dropna=False)
        .agg(
            count=(\"risk_priority_score\", \"size\"),
            risk_priority_score=(\"risk_priority_score\", \"mean\"),
            high_risk_rows=(\"is_high_risk\", \"sum\"),
        )
        .reset_index()
        .sort_values([\"count\", \"risk_priority_score\"], ascending=[False, False])
    )

    matched_groups = int(len(grouped))
    top = grouped.head(ARCHIVE_CONCENTRATION_LIMIT)
    items = [
        ArchiveConcentrationItem(
            label=_analytics_text(row[label_column]) or \"Tidak diketahui\",
            key=_analytics_text(row[key_column]),
            count=int(row[\"count\"]),
            risk_priority_score=round(float(row[\"risk_priority_score\"] or 0.0), 6),
            high_risk_rows=int(row[\"high_risk_rows\"]),
            share=round(float(row[\"count\"]) / matched_rows, 6) if matched_rows > 0 else 0.0,
        )
        for _, row in top.iterrows()
    ]
"""

NEW = """    group_columns = [label_column] if label_column == key_column else [label_column, key_column]
    grouped = (
        df.groupby(group_columns, dropna=False)
        .agg(
            count=(\"risk_priority_score\", \"size\"),
            risk_priority_score=(\"risk_priority_score\", \"mean\"),
            high_risk_rows=(\"is_high_risk\", \"sum\"),
        )
        .reset_index()
        .sort_values([\"count\", \"risk_priority_score\"], ascending=[False, False])
    )

    matched_groups = int(len(grouped))
    top = grouped.head(ARCHIVE_CONCENTRATION_LIMIT)
    items = [
        ArchiveConcentrationItem(
            label=_analytics_text(row[label_column]) or \"Tidak diketahui\",
            key=_analytics_text(row[key_column] if key_column in top.columns else row[label_column]),
            count=int(row[\"count\"]),
            risk_priority_score=round(float(row[\"risk_priority_score\"] or 0.0), 6),
            high_risk_rows=int(row[\"high_risk_rows\"]),
            share=round(float(row[\"count\"]) / matched_rows, 6) if matched_rows > 0 else 0.0,
        )
        for _, row in top.iterrows()
    ]
"""

if OLD not in text:
    raise SystemExit("OLD snippet not found; refusing to patch.")
if NEW in text:
    print("already patched")
else:
    target.write_text(text.replace(OLD, NEW, 1), encoding="utf-8")
    print("patched")
