.PHONY: install-python inference-smoke static-casebook verify-python guardrail-audit verify

PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip

install-python:
	python3 -m venv .venv
	$(PIP) install -r requirements.txt

inference-smoke:
	PYTHONPATH=. $(PYTHON) scripts/inference_smoke.py

static-casebook:
	PYTHONPATH=. $(PYTHON) -m src.casebook

verify-python:
	$(PYTHON) -m compileall src tests scripts
	PYTHONPATH=. $(PYTHON) -m pytest tests

guardrail-audit:
	$(PYTHON) -c "from pathlib import Path; blocked=['terbukti fraud','terbukti korupsi','fraud final','legal verdict','confirmed corruption','putusan hukum']; paths=[p for p in Path('.').rglob('*') if p.is_file() and p.suffix in {'.py','.md','.html','.ipynb'} and not any(x in p.parts for x in {'.git','.venv','__pycache__'})]; text='\\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in paths).lower(); hits=[b for b in blocked if b in text]; raise SystemExit('Blocked guardrail copy: '+', '.join(hits) if hits else 0)"

verify: verify-python inference-smoke guardrail-audit
