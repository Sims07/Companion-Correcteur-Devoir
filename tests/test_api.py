from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_reports_application_status() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "application": "Companion Correcteur Devoir",
    }


def test_valid_rubric_is_accepted() -> None:
    response = client.post(
        "/rubrics/validate",
        json={
            "title": "Cell biology",
            "total_points": 10,
            "criteria": [
                {
                    "id": "c1",
                    "description": "Explain the role of the membrane",
                    "max_points": 6,
                    "expected_elements": ["selective permeability"],
                },
                {
                    "id": "c2",
                    "description": "Use accurate terminology",
                    "max_points": 4,
                },
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["valid"] is True
    assert response.json()["criteria_count"] == 2


def test_rubric_cannot_exceed_total_points() -> None:
    response = client.post(
        "/rubrics/validate",
        json={
            "title": "Invalid rubric",
            "total_points": 5,
            "criteria": [
                {"id": "c1", "description": "Criterion", "max_points": 6}
            ],
        },
    )
    assert response.status_code == 422


def test_rubric_criterion_ids_must_be_unique() -> None:
    response = client.post(
        "/rubrics/validate",
        json={
            "title": "Duplicate IDs",
            "total_points": 10,
            "criteria": [
                {"id": "same", "description": "First", "max_points": 3},
                {"id": "same", "description": "Second", "max_points": 3},
            ],
        },
    )
    assert response.status_code == 422
