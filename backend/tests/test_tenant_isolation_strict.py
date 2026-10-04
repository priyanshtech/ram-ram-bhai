
import uuid

def test_tenant_isolation_strict_upload(client):
    uid = str(uuid.uuid4())[:8]
    # Setup Tenant A
    resp_a = client.post("/api/v1/auth/signup", json={
        "email": f"a_strict_{uid}@example.com",
        "password": "password",
        "full_name": "Tenant A",
        "tenant_name": "A Co"
    })
    data_a = resp_a.json()
    token_a = data_a["access_token"]
    tenant_a_id = data_a["tenant_id"]
    bot_a_id = data_a["bot_id"]

    # Setup Tenant B
    resp_b = client.post("/api/v1/auth/signup", json={
        "email": f"b_strict_{uid}@example.com",
        "password": "password",
        "full_name": "Tenant B",
        "tenant_name": "B Co"
    })
    data_b = resp_b.json()
    token_b = data_b["access_token"]
    tenant_b_id = data_b["tenant_id"]
    bot_b_id = data_b["bot_id"]

    # Tenant A tries to ingest URL into Tenant B's bot!
    # They pass tenant_a_id to bypass the require_tenant_access middleware
    # But knowledge.py explicitly checks if Bot belongs to tenant_a_id
    
    malicious_ingest = client.post(
        f"/api/v1/knowledge/{bot_b_id}/ingest-url?tenant_id={tenant_a_id}",
        json={"url": "https://example.com"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    
    assert malicious_ingest.status_code == 404
    assert "Bot not found or access denied" in malicious_ingest.json()["detail"]
    
    # Legit ingest should work
    legit_ingest = client.post(
        f"/api/v1/knowledge/{bot_a_id}/ingest-url?tenant_id={tenant_a_id}",
        json={"url": "https://example.com"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert legit_ingest.status_code == 202
    assert "source_id" in legit_ingest.json()
