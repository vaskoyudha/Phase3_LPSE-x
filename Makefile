PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip
ML_REPO ?= ../lpseN

.PHONY: install-python run-api inference-smoke verify-python build-frontend verify

install-python:
	python3 -m venv .venv
	$(PIP) install -r requirements.txt

run-api:
	LPSEX_ML_REPO=$(ML_REPO) PYTHONPATH=. $(PYTHON) -m uvicorn src.api:app --host 127.0.0.1 --port 8888

inference-smoke:
	LPSEX_ML_REPO=$(ML_REPO) PYTHONPATH=. $(PYTHON) scripts/inference_smoke.py

verify-python:
	$(PYTHON) -m compileall src tests scripts
	LPSEX_ML_REPO=$(ML_REPO) PYTHONPATH=. $(PYTHON) -m pytest tests

build-frontend:
	cd frontend && npm ci && npm run typecheck && npm run lint && npm run test && npm run build

verify: verify-python
