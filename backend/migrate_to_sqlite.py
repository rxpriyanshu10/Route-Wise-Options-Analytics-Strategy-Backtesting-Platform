"""One-time migration: load all CSV files into a SQLite database."""
import sqlite3
import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "options.db"


def migrate():
    frames = []
    for csv_file in sorted(DATA_DIR.glob("*.csv")):
        df = pd.read_csv(csv_file)
        frames.append(df)
        print(f"Read {csv_file.name}: {len(df)} rows")

    combined = pd.concat(frames, ignore_index=True)
    print(f"Total rows: {len(combined)}")

    conn = sqlite3.connect(DB_PATH)
    combined.to_sql("options", conn, if_exists="replace", index=False)

    # Create indexes for common query patterns
    conn.execute("CREATE INDEX IF NOT EXISTS idx_expiry ON options(expiry)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_datetime ON options(datetime)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_strike ON options(strike)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_expiry_datetime ON options(expiry, datetime)")
    conn.commit()

    # Verify
    count = conn.execute("SELECT COUNT(*) FROM options").fetchone()[0]
    print(f"SQLite database created at {DB_PATH} with {count} rows")
    conn.close()


if __name__ == "__main__":
    migrate()
