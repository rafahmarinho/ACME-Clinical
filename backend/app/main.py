import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.routers import admin, alarms, maintenance, me, monitors, overview, patients, reports, simulation, thresholds

logger = logging.getLogger("acme")
settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Simulated patient-monitoring API for the ACME Clinical demo. All data is fictional.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    errors = exc.errors()
    first = errors[0] if errors else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
    message = first.get("msg", "Invalid request").removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": f"{field}: {message}" if field else message, "errors": jsonable(errors)})


def jsonable(errors: list) -> list:
    return [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in errors]


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception):
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on the server. Please try again."})


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok", "service": settings.app_name, "environment": settings.environment}


for module in (me, overview, patients, alarms, monitors, maintenance, thresholds, reports, admin, simulation):
    app.include_router(module.router, prefix="/api")
