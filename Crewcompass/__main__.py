"""Run with: python -m crewcompass  (from the backend folder)."""
import argparse

import uvicorn

from . import db, service


def main():
    p = argparse.ArgumentParser(description="CrewCompass server")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--no-demo", action="store_true", help="do not seed demo data on an empty database")
    a = p.parse_args()
    if not a.no_demo:
        with db.connect() as conn:
            if not service.list_crew(conn):
                print("Empty database: seeding simulated demo data (labelled 'simulated').")
                service.seed_demo(conn)
    uvicorn.run("crewcompass.api:app", host=a.host, port=a.port)


if __name__ == "__main__":
    main()
