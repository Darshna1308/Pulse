# Build context: repository root (see docker-compose.yml).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PULSE_ML_MODEL_DIR=/app/models
WORKDIR /app

COPY services/ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ml/pulse_ml ./pulse_ml
# Training and evaluation are deterministic (fixed seeds), so the image always
# contains the same model version and an evaluation report that matches it.
RUN python -m pulse_ml.train && python -m pulse_ml.evaluate

RUN useradd --system --uid 10001 pulse && chown -R pulse /app
USER pulse
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uvicorn", "pulse_ml.api:app", "--host", "0.0.0.0", "--port", "8000"]
