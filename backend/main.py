import json
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import anthropic
import os
from dotenv import load_dotenv


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

logs = []  # in-memory log store

class QueryRequest(BaseModel):
    query: str

def stream_claude(query: str):
    log_entry = {
        "timestamp": time.strftime("%H:%M:%S"),
        "query": query,
        "tokens": 0,
        "latency_ms": 0,
    }
    start = time.time()

    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": query}],
        system="You are an AI assistant helping enterprise users solve business problems. Be concise and structured.",
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"

    usage = stream.get_final_message().usage
    log_entry["tokens"] = usage.input_tokens + usage.output_tokens
    log_entry["latency_ms"] = round((time.time() - start) * 1000)
    logs.append(log_entry)

    yield f"data: {json.dumps({'type': 'done', 'log': log_entry})}\n\n"

@app.post("/query")
def query(req: QueryRequest):
    return StreamingResponse(
        stream_claude(req.query),
        media_type="text/event-stream"
    )

@app.get("/logs")
def get_logs():
    return {"logs": logs[-20:]}  # last 20 entries

@app.get("/health")
def health():
    return {"status": "ok"}