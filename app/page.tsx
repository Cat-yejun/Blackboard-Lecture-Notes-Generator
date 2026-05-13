"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import katex from "katex";

// ── LaTeX renderer ──────────────────────────────────────────────
function MathDisplay({ math, display }: { math: string; display: boolean }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    try {
      setHtml(katex.renderToString(math, { displayMode: display, throwOnError: false }));
    } catch {
      setHtml("");
    }
  }, [math, display]);

  if (!html) return <code className={`math-raw${display ? " math-raw-block" : ""}`}>{display ? `$$${math}$$` : `$${math}$`}</code>;
  return <span className={display ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderLine(line: string) {
  const parts: React.ReactNode[] = [];
  let rest = line, key = 0;
  while (rest.length > 0) {
    if (rest.startsWith("$$")) {
      const end = rest.indexOf("$$", 2);
      if (end !== -1) { parts.push(<MathDisplay key={key++} math={rest.slice(2, end)} display={true} />); rest = rest.slice(end + 2); continue; }
    }
    if (rest.startsWith("$") && rest[1] !== "$") {
      const end = rest.indexOf("$", 1);
      if (end !== -1) { parts.push(<MathDisplay key={key++} math={rest.slice(1, end)} display={false} />); rest = rest.slice(end + 1); continue; }
    }
    let next = Infinity;
    const bi = rest.indexOf("$$", 1); if (bi > 0) next = Math.min(next, bi);
    const ii = rest.indexOf("$", 1); if (ii > 0) next = Math.min(next, ii);
    if (next === Infinity) { parts.push(<span key={key++}>{rest}</span>); rest = ""; }
    else { parts.push(<span key={key++}>{rest.slice(0, next)}</span>); rest = rest.slice(next); }
  }
  return parts;
}

// ── Main component ───────────────────────────────────────────────
export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<{ data: string; mediaType: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"rendered" | "latex">("rendered");
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback((file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setResult(null); setSummary(null); setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target!.result as string;
      setImage(dataUrl);
      setImageBase64({ data: dataUrl.split(",")[1], mediaType: file.type });
    };
    reader.readAsDataURL(file);
  }, []);

  const analyze = async () => {
    if (!imageBase64) return;
    setLoading(true); setError(null); setResult(null); setSummary(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: imageBase64.data, mediaType: imageBase64.mediaType }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || `오류 ${res.status}`); return; }
      const [main, sum] = (data.text as string).split("---SUMMARY---");
      setResult(main.trim());
      setSummary(sum?.trim() || null);
    } catch (e: any) {
      setError(`네트워크 오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-icon">📐</div>
        <div>
          <h1>칠판 → 텍스트 변환기</h1>
          <p>Blackboard OCR · LaTeX · AI-Powered</p>
        </div>
      </header>

      <main className="main">
        {/* LEFT */}
        <div className="left-panel">
          <div
            ref={dropRef}
            className="drop-zone"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add("drag-over"); }}
            onDragLeave={() => dropRef.current?.classList.remove("drag-over")}
            onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove("drag-over"); handleFile(e.dataTransfer.files[0]); }}
          >
            {image
              ? <img src={image} alt="칠판 미리보기" />
              : <div className="drop-placeholder">
                  <div className="drop-icon">🖼️</div>
                  <div className="drop-label">칠판 사진을 업로드하세요</div>
                  <div className="drop-sub">drag & drop · 클릭하여 선택 · 카메라 촬영</div>
                </div>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          <button className="analyze-btn" onClick={analyze} disabled={!imageBase64 || loading}>
            {loading ? <><div className="spinner" />분석 중...</> : <>✨ AI로 텍스트 추출</>}
          </button>
        </div>

        {/* RIGHT */}
        <div className="right-panel">
          <div className="tabs">
            <button className={`tab ${tab === "rendered" ? "active" : ""}`} onClick={() => setTab("rendered")}>렌더링</button>
            <button className={`tab ${tab === "latex" ? "active" : ""}`} onClick={() => setTab("latex")}>LaTeX 소스</button>
          </div>

          {summary && <div className="summary-bar"><span className="summary-label">요약</span><span>{summary}</span></div>}
          {result && <button className="copy-btn" onClick={copy}>{copied ? "✓ 복사됨" : "📋 LaTeX 복사"}</button>}

          <div className="result-area">
            {loading ? (
              <div className="loading-state">
                <div className="loading-dots">
                  <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
                </div>
                <div className="loading-text">칠판 내용 분석 중...</div>
              </div>
            ) : error ? (
              <div className="error-msg">{error}</div>
            ) : result ? (
              tab === "rendered"
                ? <div className="rendered-content">
                    {result.split("\n").map((line, i) => (
                      <div key={i} className="rendered-line">{line ? renderLine(line) : null}</div>
                    ))}
                  </div>
                : <div className="raw-content">{result}</div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <div className="empty-state-text">결과가 여기에 표시됩니다</div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
