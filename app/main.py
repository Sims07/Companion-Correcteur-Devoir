"""Minimal API entry point; grading remains teacher-reviewed by design."""

from fastapi import FastAPI

from app.schemas import Rubric

app = FastAPI(
    title="Companion Correcteur Devoir",
    description=(
        "Local-first, teacher-supervised grading assistance. " 
        "This foundation does not upload or process student copies."
    ),
    version="0.1.0",
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "application": "Companion Correcteur Devoir"}


@app.post("/rubrics/validate", tags=["rubrics"])
def validate_rubric(rubric: Rubric) -> dict[str, object]:
    """Validate a rubric without storing it or sending it to an external service."""
    return {
        "valid": True,
        "title": rubric.title,
        "total_points": rubric.total_points,
        "criteria_count": len(rubric.criteria),
    }
