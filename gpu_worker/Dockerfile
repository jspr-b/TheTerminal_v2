# GPU worker for one Kumo-TS model. Build it once per model (see docker-compose.gpu.yml):
#   MODEL=forecast, KUMO_TS_PACKAGE=Kumo-Forecast   or   MODEL=anomaly, KUMO_TS_PACKAGE=Kumo-Anomaly
# Needs an NVIDIA GPU with the NVIDIA Container Toolkit on the host. Weights download from Hugging Face
# (nvidia/Kumo-Forecast, nvidia/Kumo-Anomaly) on the first request and are kept in the /models volume.
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04

ARG MODEL=forecast
ARG KUMO_TS_PACKAGE=Kumo-Forecast
# Pinned: the commit the worker's model calls were checked against (models.py). Change both together.
ARG KUMO_TS_REF=ad459475d1302fc8365e7117e39837a8ecb6a7e3

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 UV_LINK_MODE=copy \
    HF_HOME=/models KUMO_TS_MODEL=${MODEL}

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3.12 python3.12-venv \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

RUN git clone https://github.com/NVIDIA/Kumo-TS.git /opt/kumo-ts && git -C /opt/kumo-ts checkout ${KUMO_TS_REF}
WORKDIR /opt/kumo-ts/${KUMO_TS_PACKAGE}
RUN uv sync --frozen --python 3.12 --no-dev \
 && uv pip install --python .venv/bin/python "fastapi>=0.115" "uvicorn>=0.32" "pandas>=2.2"

COPY worker.py models.py /opt/worker/
ENV PATH=/opt/kumo-ts/${KUMO_TS_PACKAGE}/.venv/bin:$PATH \
    PYTHONPATH=/opt/kumo-ts/${KUMO_TS_PACKAGE}:/opt/worker

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uvicorn", "worker:app", "--app-dir", "/opt/worker", "--host", "0.0.0.0", "--port", "8000"]
