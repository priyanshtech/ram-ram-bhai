
import uuid

def test_widget_strict_domain_enforcement(client):
    uid = str(uuid.uuid4())[:8]
    # Setup: Create a tenant and bot
    resp = client.post("/api/v1/auth/signup", json={
        "email": f"widget_strict_{uid}@example.com",
        "password": "password",
        "full_name": "Widget Tester",
        "tenant_name": "Widget Co"
    })
    data = resp.json()
    bot_id = data["bot_id"]
    token = data["access_token"]
    tenant_id = data["tenant_id"]

    # Get Bot public key
    b_resp = client.get(
        f"/api/v1/bots/{bot_id}?tenant_id={tenant_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    public_key = b_resp.json()["public_key"]
    
    # Add allowed domain
    client.post(
        f"/api/v1/bots/{bot_id}/domains?tenant_id={tenant_id}",
        json={"domain": "my-allowed-site.com"},
        headers={"Authorization": f"Bearer {token}"}
    )

    # 1. Widget Session creation fails with no origin
    session_resp_missing_origin = client.post("/api/v1/widget/session", json={
        "public_key": public_key
    })
    assert session_resp_missing_origin.status_code == 403
    assert "Origin header missing" in session_resp_missing_origin.json()["detail"]

    # 2. Widget Session creation fails with wrong origin
    session_resp_wrong_origin = client.post(
        "/api/v1/widget/session",
        json={"public_key": public_key},
        headers={"Origin": "https://evil.com"}
    )
    assert session_resp_wrong_origin.status_code == 403
    assert "Domain not allowed" in session_resp_wrong_origin.json()["detail"]

    # 3. Widget Session creation succeeds with correct origin
    session_resp_correct = client.post(
        "/api/v1/widget/session",
        json={"public_key": public_key},
        headers={"Origin": "https://my-allowed-site.com"}
    )
    assert session_resp_correct.status_code == 200
    visitor_token = session_resp_correct.json()["visitor_session_token"]

    # 4. Authenticated Chat Query with missing origin should fail
    chat_resp_missing_origin = client.post(
        "/api/v1/chat/query",
        json={"message": "hello"},
        headers={"Authorization": f"Bearer {visitor_token}"}
    )
    assert chat_resp_missing_origin.status_code == 403
    assert "Origin header missing" in chat_resp_missing_origin.json()["detail"]
    
    # 5. Authenticated Chat Query with spoofed origin should fail
    chat_resp_wrong_origin = client.post(
        "/api/v1/chat/query",
        json={"message": "hello"},
        headers={
            "Authorization": f"Bearer {visitor_token}",
            "Origin": "https://evil-spoofed.com"
        }
    )
    assert chat_resp_wrong_origin.status_code == 403
    assert "Origin mismatch" in chat_resp_wrong_origin.json()["detail"]

    # 6. Authenticated Chat Query with correct origin should succeed
    chat_resp_correct = client.post(
        "/api/v1/chat/query",
        json={"message": "hello"},
        headers={
            "Authorization": f"Bearer {visitor_token}",
            "Origin": "https://my-allowed-site.com"
        }
    )
    assert chat_resp_correct.status_code == 200
    assert chat_resp_correct.headers["content-type"] == "text/event-stream; charset=utf-8"
