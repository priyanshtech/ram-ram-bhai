
def test_widget_security(client, unique_id: str):
    # Setup: Create a tenant and bot
    resp = client.post("/api/v1/auth/signup", json={
        "email": f"w_{unique_id}@example.com",
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

    # Exchange public key for visitor session
    session_resp = client.post(
        "/api/v1/widget/session", 
        json={"public_key": public_key},
        headers={"Origin": "http://localhost:3000"}
    )
    assert session_resp.status_code == 200
    session_data = session_resp.json()
    assert "visitor_session_token" in session_data

    visitor_token = session_data["visitor_session_token"]

    # Use visitor session token in chat query
    chat_resp = client.post(
        "/api/v1/chat/query",
        json={
            "message": "Hello world",
            "visitor_session_id": "session-1234",
            "visitor_name": "Test Visitor"
        },
        headers={
            "Authorization": f"Bearer {visitor_token}",
            "Origin": "http://localhost:3000"
        }
    )
    assert chat_resp.status_code == 200
    assert "text/event-stream" in chat_resp.headers["content-type"]
    assert "data:" in chat_resp.text
