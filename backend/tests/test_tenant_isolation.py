
def test_tenant_isolation(client, unique_id: str):
    # Create Tenant A
    resp_a = client.post("/api/v1/auth/signup", json={
        "email": f"a_{unique_id}@example.com",
        "password": "password",
        "full_name": "User A",
        "tenant_name": "Tenant A"
    })
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    token_a = data_a["access_token"]
    tenant_id_a = data_a["tenant_id"]
    bot_id_a = data_a["bot_id"]

    # Create Tenant B
    resp_b = client.post("/api/v1/auth/signup", json={
        "email": f"b_{unique_id}@example.com",
        "password": "password",
        "full_name": "User B",
        "tenant_name": "Tenant B"
    })
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    token_b = data_b["access_token"]
    tenant_id_b = data_b["tenant_id"]
    bot_id_b = data_b["bot_id"]

    # Tenant A tries to read Tenant A's bot (Success)
    resp = client.get(
        f"/api/v1/bots/{bot_id_a}?tenant_id={tenant_id_a}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == bot_id_a

    # Tenant A tries to read Tenant B's bot using Tenant B's bot_id and tenant_id
    resp_hack1 = client.get(
        f"/api/v1/bots/{bot_id_b}?tenant_id={tenant_id_b}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp_hack1.status_code in [404, 403]

    # Tenant A tries to read Tenant B's bot passing Tenant A's tenant_id
    resp_hack2 = client.get(
        f"/api/v1/bots/{bot_id_b}?tenant_id={tenant_id_a}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp_hack2.status_code == 404
