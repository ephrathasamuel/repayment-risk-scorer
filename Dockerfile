# Scoring API (Linux image)
FROM python:3.13-slim

# LightGBM needs the OpenMP runtime on Linux
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api ./api
COPY ml ./ml
COPY models ./models

RUN useradd --create-home scorer && mkdir -p /app/data && chown scorer /app/data
USER scorer

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
