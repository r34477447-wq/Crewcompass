"""HTTP layer (Starlette). Thin: validation in, JSON out; logic lives in service.py."""
from __future__ import annotations

from pydantic import BaseModel, Field, ValidationError
from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from . import config as C
from . import db, digest, meta, service, validation


class CheckIn(BaseModel):
    astronaut_id: int
    headache: float = Field(ge=0, le=10)
    vision: float = Field(ge=0, le=10)
    congestion: float = Field(ge=0, le=10)
    fatigue: float = Field(ge=0, le=10)
    sleep_quality: float = Field(ge=0, le=10)
    mood: float = Field(ge=1, le=5)
    reaction_ms: float = Field(ge=100, le=3000)
    ts: int | None = None


class SeedReq(BaseModel):
    scenario: str = Field("planted", pattern="^(planted|none)$")
    days: int = Field(60, ge=30, le=120)
    seed: int = 7


def J(data, status=200):
    return JSONResponse(data, status_code=status)


async def health(request):
    return J({"ok": True, "app": "CrewCompass", "disclaimer": C.DISCLAIMER})


async def crew(request):
    with db.connect() as conn:
        return J({"crew": service.crew_overview(conn), "mission_now": service.mission_now(conn),
                  "scenario": db.get_meta(conn, "scenario", "live")})


async def crew_status(request):
    aid = int(request.path_params["aid"])
    with db.connect() as conn:
        if not any(a["id"] == aid for a in service.list_crew(conn)):
            raise HTTPException(404, "unknown astronaut")
        return J(service.status(conn, aid))


async def crew_history(request):
    aid = int(request.path_params["aid"])
    with db.connect() as conn:
        return J({"history": service.history(conn, aid)})


async def post_checkin(request: Request):
    try:
        body = CheckIn.model_validate(await request.json())
    except (ValidationError, ValueError) as e:
        return J({"error": "invalid check-in", "detail": e.errors(include_url=False, include_context=False) if isinstance(e, ValidationError) else str(e)}, 422)
    with db.connect() as conn:
        try:
            res = service.add_checkin(conn, body.astronaut_id, body.model_dump(), body.ts)
        except KeyError:
            raise HTTPException(404, "unknown astronaut")
        service._CACHE.clear()
        return J({**res, "status": service.status(conn, body.astronaut_id)}, 201)


async def env_summary(request):
    with db.connect() as conn:
        return J(service.env_summary(conn))


async def env_series(request):
    hours = int(request.query_params.get("hours", 24 * 14))
    step = int(request.query_params.get("step", 1))
    with db.connect() as conn:
        return J(service.env_series(conn, max(1, min(hours, 24 * 120)), max(1, min(step, 48))))


async def env_ingest(request: Request):
    form = await request.form()
    up = form.get("file")
    if up is None or not hasattr(up, "read"):
        return J({"error": "attach a CSV as 'file'"}, 400)
    raw = await up.read()
    if len(raw) > 25 * 1024 * 1024:
        return J({"error": "file larger than 25 MB"}, 413)
    with db.connect() as conn:
        try:
            res = service.ingest_eda(conn, raw, str(form.get("rebase", "1")) != "0")
        except ValueError as e:
            return J({"error": str(e)}, 422)
        service._CACHE.clear()
        return J(res)


async def demo_seed(request: Request):
    try:
        body = SeedReq.model_validate(await request.json() if await request.body() else {})
    except (ValidationError, ValueError) as e:
        return J({"error": str(e)}, 422)
    with db.connect() as conn:
        return J(service.seed_demo(conn, body.scenario == "planted", body.days, body.seed))


async def get_digest(request):
    fmt = request.query_params.get("format", "json")
    with db.connect() as conn:
        text, mime = digest.render(conn, "md" if fmt == "md" else "json")
    return Response(text, media_type=mime, headers={"X-Size-Bytes": str(len(text.encode()))})


_VALIDATION: dict = {}


async def get_validation(request):
    seeds = max(2, min(int(request.query_params.get("seeds", 10)), 30))
    if seeds not in _VALIDATION:
        _VALIDATION[seeds] = validation.run(seeds)
    return J(_VALIDATION[seeds])


async def get_meta(request):
    return J({"requirements": meta.REQUIREMENTS, "requirements_note": meta.REQUIREMENTS_NOTE,
              "sources": meta.SOURCES, "acknowledgement": meta.ACKNOWLEDGEMENT,
              "disclaimer": C.DISCLAIMER})


async def index(request):
    return FileResponse(C.FRONTEND_DIR / "index.html")


def create_app() -> Starlette:
    routes = [
        Route("/api/health", health),
        Route("/api/meta", get_meta),
        Route("/api/crew", crew),
        Route("/api/crew/{aid:int}/status", crew_status),
        Route("/api/crew/{aid:int}/history", crew_history),
        Route("/api/checkins", post_checkin, methods=["POST"]),
        Route("/api/environment/summary", env_summary),
        Route("/api/environment/series", env_series),
        Route("/api/environment/ingest", env_ingest, methods=["POST"]),
        Route("/api/demo/seed", demo_seed, methods=["POST"]),
        Route("/api/digest", get_digest),
        Route("/api/validation", get_validation),
        Route("/", index),
    ]
    if C.FRONTEND_DIR.exists():
        routes.append(Mount("/", StaticFiles(directory=C.FRONTEND_DIR), name="static"))
    return Starlette(routes=routes)


app = create_app()
