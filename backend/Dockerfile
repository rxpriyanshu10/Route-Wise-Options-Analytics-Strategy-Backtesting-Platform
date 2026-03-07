FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Auto-generate SQLite DB from CSVs if options.db doesn't exist
RUN python -c "from pathlib import Path; \
    db = Path('data/options.db'); \
    csvs = list(Path('data').glob('*.csv')); \
    exec('from migrate_to_sqlite import migrate; migrate()') if csvs and not db.exists() else None"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
