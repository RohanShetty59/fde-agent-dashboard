import { useState, useRef, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface LogEntry {
  timestamp: string;
  query: string;
  tokens: number;
  latency_ms: number;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const responseRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    const res = await fetch(`${API_URL}/logs`);
    const data = await res.json();
    setLogs(data.logs.reverse());
  };

  const handleSubmit = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setResponse("");

    const res = await fetch(`${API_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const json = JSON.parse(line.replace("data: ", ""));
        if (json.type === "text") {
          setResponse((prev) => prev + json.content);
        }
        if (json.type === "done") {
          fetchLogs();
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>AI Agent Dashboard</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 13 }}>
        FDE Demo — Claude-powered enterprise query interface
      </p>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a business query (e.g. 'Summarise top 3 supply chain risks for a fashion retailer')"
          rows={3}
          style={{
            flex: 1, padding: 12, fontSize: 14,
            border: "1px solid #ccc", borderRadius: 6, resize: "vertical",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) handleSubmit();
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: "0 20px", background: loading ? "#999" : "#1a1a1a",
            color: "white", border: "none", borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer", fontSize: 14,
          }}
        >
          {loading ? "Running…" : "Send"}
        </button>
      </div>

      {/* Response */}
      {(response || loading) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 6, textTransform: "uppercase" }}>
            Response
          </div>
          <div
            ref={responseRef}
            style={{
              background: "#f8f8f8", border: "1px solid #e0e0e0",
              borderRadius: 6, padding: 16, minHeight: 120, maxHeight: 400,
              overflowY: "auto", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6,
            }}
          >
            {response}
            {loading && <span style={{ opacity: 0.4 }}>▌</span>}
          </div>
        </div>
      )}

      {/* Log Panel */}
      {logs.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 6, textTransform: "uppercase" }}>
            Agent Logs
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #eee", color: "#999" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Time</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Query</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Tokens</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Latency</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 8px", color: "#999" }}>{log.timestamp}</td>
                  <td style={{ padding: "6px 8px" }}>{log.query.slice(0, 60)}…</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{log.tokens}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{log.latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}