import socket

from app.workers.ingestion_worker import is_valid_url


def test_ssrf_protection_valid_url():
    assert is_valid_url("https://www.google.com") is True
    assert is_valid_url("http://example.com/about") is True

def test_ssrf_protection_blocked_ips():
    # Localhost
    assert is_valid_url("http://localhost") is False
    assert is_valid_url("http://localhost:8080") is False
    # IPv4 loopback
    assert is_valid_url("http://127.0.0.1") is False
    assert is_valid_url("http://127.0.0.1:8000") is False
    assert is_valid_url("http://127.123.0.1") is False
    # IPv6 loopback
    assert is_valid_url("http://[::1]") is False
    # IPv4 Private
    assert is_valid_url("http://192.168.1.1") is False
    assert is_valid_url("http://10.0.0.5") is False
    assert is_valid_url("http://172.16.0.1") is False
    # IPv4 Link-local
    assert is_valid_url("http://169.254.169.254") is False
    # IPv6 Link-local / Unique local
    # Testing general parse block via ipaddress logic
    assert is_valid_url("http://[fe80::1]") is False
    assert is_valid_url("http://[fc00::1]") is False

def test_ssrf_protection_invalid_scheme():
    assert is_valid_url("ftp://example.com") is False
    assert is_valid_url("file:///etc/passwd") is False

def test_ssrf_protection_dns_resolution(monkeypatch):
    # Mock socket to return a private IP for a seemingly public domain (DNS rebinding simulation setup)
    def mock_getaddrinfo(host, port, proto=0, *args, **kwargs):
        if host == "sneaky.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, '', ('127.0.0.1', 80))]
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, '', ('93.184.216.34', 80))]
        
    monkeypatch.setattr("socket.getaddrinfo", mock_getaddrinfo)
    
    assert is_valid_url("http://sneaky.com") is False
    assert is_valid_url("http://normal.com") is True
