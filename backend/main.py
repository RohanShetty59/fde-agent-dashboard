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

START_TIME = time.time()

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
    total_queries = len(logs)
    avg_latency_ms = (
        round(sum(l["latency_ms"] for l in logs) / total_queries)
        if total_queries > 0 else 0
    )
    avg_tokens = (
        round(sum(l["tokens"] for l in logs) / total_queries)
        if total_queries > 0 else 0
    )
    # Claude Sonnet pricing: $3 per 1M input tokens (approximate blended rate)
    cost_per_query_usd = round((avg_tokens / 1_000_000) * 3, 6) if avg_tokens > 0 else 0

    uptime_seconds = int(time.time() - START_TIME)
    hours, remainder = divmod(uptime_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)

    return {
        "status": "ok",
        "uptime": f"{hours}h {minutes}m {seconds}s",
        "total_queries": total_queries,
        "avg_latency_ms": avg_latency_ms,
        "avg_tokens_per_query": avg_tokens,
        "estimated_cost_per_query_usd": cost_per_query_usd,
    }