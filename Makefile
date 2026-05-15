.PHONY: install-python install-frontend build-frontend run-api inference-smoke verify-python verify-frontend verify guardrail-audit

PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip
UVICORN ?= .venv/bin/uvicorn

install-python:
	python3 -m venv .venv
	$(PIP) install -r requirements.txt

install-frontend:
	cd frontend && npm ci

build-frontend:
	cd frontend && npm run build

run-api:
	$(UVICORN) backend.api:app --host 127.0.0.1 --port 8000

inference-smoke:
	PYTHONPATH=. $(PYTHON) scripts/inference_smoke.py

verify-python:
	$(PYTHON) -m compileall src backend tests
	$(PYTHON) -m pytest

verify-frontend:
	cd frontend && npm run typecheck && npm run lint && npm run test && npm run build

guardrail-audit:
	! grep -RniI --exclude-dir=__pycache__ --exclude-dir=node_modules --exclude-dir=dist --exclude=package-lock.json --exclude-dir=.git -E "terbukti[[:space:]-]+fraud|terbukti[[:space:]-]+korupsi|fraud[[:space:]-]+final|legal[[:space:]-]+verdict|confirmed[[:space:]-]+corruption|putusan[[:space:]-]+hukum" src backend frontend README.md DEMO_SCRIPT.md demo_casebook.html tests docs

verify: verify-python verify-frontend inference-smoke guardrail-audit
