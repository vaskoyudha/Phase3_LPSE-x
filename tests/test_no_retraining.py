from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PRODUCT_SURFACES = [
    PROJECT_ROOT / "src" / "artifacts.py",
    PROJECT_ROOT / "src" / "product_demo.py",
    PROJECT_ROOT / "src" / "casebook.py",
]


def test_model_only_runtime_surfaces_do_not_start_training_or_scraping():
    combined = "\n".join(path.read_text(encoding="utf-8") for path in PRODUCT_SURFACES)
    blocked_runtime_calls = [
        ".fit(",
        "fit(",
        "optuna.create_study",
        "requests.get",
        "requests.post",
        "urlopen(",
        "scrapy",
        "BeautifulSoup",
        "to_parquet(",
        "to_csv(",
    ]

    violations = [term for term in blocked_runtime_calls if term in combined]
    assert violations == []


def test_docs_describe_local_offline_demo_boundaries():
    docs = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")
    team_members_file = (PROJECT_ROOT / "PROJECT_GUIDELINES.md").read_text(encoding="utf-8")
    combined = f"{docs}\n{team_members_file}".lower()

    assert "offline" in combined
    assert "no live scraping" in combined or "tanpa scraping" in combined
    assert "no retraining" in combined or "tanpa retraining" in combined
    assert "no cloud" in combined or "tanpa cloud" in combined
