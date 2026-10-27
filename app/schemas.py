"""Validated data contracts for rubrics and reviewable grading suggestions."""

from pydantic import BaseModel, Field, model_validator


class RubricCriterion(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=1000)
    max_points: float = Field(ge=0, le=100)
    expected_elements: list[str] = Field(default_factory=list)


class Rubric(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    total_points: float = Field(gt=0, le=1000)
    criteria: list[RubricCriterion] = Field(min_length=1)

    @model_validator(mode="after")
    def criteria_must_fit_total(self) -> "Rubric":
        criteria_total = sum(item.max_points for item in self.criteria)
        if criteria_total > self.total_points:
            raise ValueError("The sum of criterion points cannot exceed total_points.")
        ids = [item.id for item in self.criteria]
        if len(ids) != len(set(ids)):
            raise ValueError("Criterion ids must be unique.")
        return self


class GradingSuggestion(BaseModel):
    criterion_id: str
    awarded_points: float = Field(ge=0)
    rationale: str = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)
    needs_review: bool = True
    question_for_teacher: str | None = None

    @model_validator(mode="after")
    def review_uncertain_suggestions(self) -> "GradingSuggestion":
        if self.confidence < 0.8:
            self.needs_review = True
        if self.needs_review and not self.question_for_teacher:
            self.question_for_teacher = "Please review this suggestion and confirm the interpretation."
        return self
