from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PRODUCT_SURFACES = [
    PROJECT_ROOT / "src" / "artifacts.py",
    PROJECT_ROOT / "src" / "product_demo.py",
    PROJECT_ROOT / "src" / "casebook.py",
    PROJECT_ROOT / "src" / "api.py",
]


def test_product_demo_surfaces_do_not_start_training_or_scraping():
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
        "load_model(str(artifact))\n    feature_names",
    ]

    # Loading the accepted UBJ artifact is allowed; model fitting, scraping, or
    # data/model export is not part of the offline demo path.
    allowed_loader = "load_model(str(artifact))\n    feature_names"
    violations = [term for term in blocked_runtime_calls if term in combined and term != allowed_loader]
    assert violations == []


def test_docs_describe_local_offline_demo_boundaries():
    docs = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")
    guidelines = (PROJECT_ROOT / "PROJECT_GUIDELINES.md").read_text(encoding="utf-8")
    combined = f"{docs}\n{guidelines}".lower()

    assert "offline" in combined
    assert "scraping" in combined and ("must not" in combined or "tidak ada" in combined)
    assert "fit(" in combined or "retraining" in combined or "training" in combined
    assert "cloud" in combined and ("no cloud" in combined or "tidak ada" in combined)
