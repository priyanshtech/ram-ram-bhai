import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture(scope="session")
def client():
    # Force DEVELOPMENT_MOCK_AI to true during tests
    settings.DEVELOPMENT_MOCK_AI = True
    with TestClient(app) as c:
        yield c

@pytest.fixture
def unique_id():
    return str(uuid.uuid4())[:8]
