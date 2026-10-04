import io
import re

import httpx

# pyrefly: ignore [missing-import]
from bs4 import BeautifulSoup

# pyrefly: ignore [missing-import]
from docx import Document as DocxDocument
from pypdf import PdfReader


def chunk_text(text: str, chunk_size: int = 600, overlap: int = 80) -> list[str]:
    """Splits text into overlapping semantic chunks."""
    text = re.sub(r'\s+', ' ', text).replace('\x00', '').strip()
    if not text:
        return []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start += chunk_size - overlap
    return chunks

async def parse_file_content(filename: str, content: bytes) -> list[str]:
    """Parses uploaded file bytes (PDF, DOCX, TXT) and returns text chunks."""
    extracted_text = ""
    filename_lower = filename.lower()

    if filename_lower.endswith(".pdf"):
        pdf = PdfReader(io.BytesIO(content))
        for page_idx, page in enumerate(pdf.pages):
            page_text = page.extract_text() or ""
            extracted_text += f"\n--- Page {page_idx + 1} ---\n{page_text}"

    elif filename_lower.endswith(".docx"):
        doc = DocxDocument(io.BytesIO(content))
        for paragraph in doc.paragraphs:
            if paragraph.text:
                extracted_text += paragraph.text + "\n"

    elif filename_lower.endswith(".txt") or filename_lower.endswith(".faq"):
        extracted_text = content.decode("utf-8", errors="ignore")

    else:
        extracted_text = content.decode("utf-8", errors="ignore")

    return chunk_text(extracted_text)

async def parse_url_content(url: str) -> list[str]:
    """Fetches a website URL, extracts cleaned body text, and returns chunks."""
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
        response = await client.get(url)
        response.raise_for_status()
        html = response.text

    soup = BeautifulSoup(html, "html.parser")
    # Remove script, style, nav, footer tags
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator=" ")
    return chunk_text(text)
