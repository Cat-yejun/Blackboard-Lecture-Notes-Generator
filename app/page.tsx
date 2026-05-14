"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import katex from "katex";

// ── Types ────────────────────────────────────────────────────────
interface Section {
  id: string;
  latex: string;
  summary: string;
  imageUrl: string;
  createdAt: Date;
}

// ── LaTeX renderer ───────────────────────────────────────────────
function MathDisplay({ math, display }: { math: string; display: boolean }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    try { setHtml(katex.renderToString(math, { displayMode: display, throwOnError: false })); }
    catch { setHtml(""); }
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

function RenderedContent({ latex }: { latex: string }) {
  return (
    <div className="rendered-content">
      {latex.split("\n").map((line, i) => (
        <div key={i} className="rendered-line">{line ? renderLine(line) : null}</div>
      ))}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<{ data: string; mediaType: string } | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"rendered" | "latex">("rendered");
  const [exportMsg, setExportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback((file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target!.result as string;
      setImage(dataUrl);
      setImageBase64({ data: dataUrl.split(",")[1], mediaType: file.type });
    };
    reader.readAsDataURL(file);
  }, []);

  const analyze = async () => {
    if (!imageBase64 || !image) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: imageBase64.data, mediaType: imageBase64.mediaType }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || `오류 ${res.status}`); return; }
      const [main, sum] = (data.text as string).split("---SUMMARY---");
      const newSection: Section = {
        id: Date.now().toString(),
        latex: main.trim(),
        summary: sum?.trim() || "",
        imageUrl: image,
        createdAt: new Date(),
      };
      setSections(prev => [...prev, newSection]);
      setImage(null);
      setImageBase64(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: unknown) {
      setError(`네트워크 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteSection = (id: string) => setSections(prev => prev.filter(s => s.id !== id));

  const moveSection = (id: string, dir: -1 | 1) => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  const allLatex = sections.map(s => s.latex).join("\n\n---\n\n");

  const exportLatex = () => {
    const doc = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}

\\title{칠판 필기}
\\date{${new Date().toLocaleDateString("ko-KR")}}

\\begin{document}
\\maketitle

${sections.map((s, i) => `\\section*{섹션 ${i + 1}${s.summary ? ` — ${s.summary}` : ""}}\n\n${s.latex}`).join("\n\n")}

\\end{document}`;
    const blob = new Blob([doc], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lecture-notes.tex"; a.click();
    URL.revokeObjectURL(url);
    setExportMsg("LaTeX 파일 저장됨!");
    setTimeout(() => setExportMsg(""), 2000);
  };

  const exportMarkdown = () => {
    const doc = `# 칠판 필기\n\n_${new Date().toLocaleDateString("ko-KR")}_\n\n` +
      sections.map((s, i) => `## 섹션 ${i + 1}${s.summary ? ` — ${s.summary}` : ""}\n\n${s.latex}`).join("\n\n---\n\n");
    const blob = new Blob([doc], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lecture-notes.md"; a.click();
    URL.revokeObjectURL(url);
    setExportMsg("Markdown 파일 저장됨!");
    setTimeout(() => setExportMsg(""), 2000);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(allLatex);
    setExportMsg("전체 복사됨!");
    setTimeout(() => setExportMsg(""), 2000);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-icon">📐</div>
        <div className="header-text">
          <h1>칠판 → 텍스트 변환기</h1>
          <p>Blackboard OCR · LaTeX · AI-Powered</p>
        </div>
        {sections.length > 0 && (
          <div className="header-actions">
            <span className="section-count">{sections.length}개 섹션</span>
            <button className="export-btn" onClick={exportMarkdown} title="Markdown으로 저장">📄 MD</button>
            <button className="export-btn" onClick={exportLatex} title="LaTeX으로 저장">📝 TEX</button>
            <button className="export-btn accent" onClick={copyAll} title="전체 LaTeX 복사">📋 전체복사</button>
            {exportMsg && <span className="export-msg">{exportMsg}</span>}
          </div>
        )}
      </header>

      <main className="main">
        {/* LEFT: 업로드 */}
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
                  <div className="drop-sub">drag & drop · 클릭하여 선택</div>
                </div>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*"
            style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          <button className="analyze-btn" onClick={analyze} disabled={!imageBase64 || loading}>
            {loading ? <><div className="spinner" />분석 중...</> : <>✨ 필기에 추가</>}
          </button>
          {error && <div className="error-msg">{error}</div>}

          {/* 썸네일 목록 */}
          {sections.length > 0 && (
            <div className="thumb-list">
              <div className="thumb-title">오늘의 필기 ({sections.length})</div>
              {sections.map((s, i) => (
                <div key={s.id} className="thumb-item">
                  <img src={s.imageUrl} alt={`섹션 ${i+1}`} className="thumb-img" />
                  <div className="thumb-info">
                    <span className="thumb-num">#{i + 1}</span>
                    <span className="thumb-sum">{s.summary || "내용 없음"}</span>
                  </div>
                  <div className="thumb-actions">
                    <button onClick={() => moveSection(s.id, -1)} disabled={i === 0} title="위로">↑</button>
                    <button onClick={() => moveSection(s.id, 1)} disabled={i === sections.length - 1} title="아래로">↓</button>
                    <button onClick={() => deleteSection(s.id)} className="del-btn" title="삭제">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: 결과 */}
        <div className="right-panel">
          <div className="tabs">
            <button className={`tab ${tab === "rendered" ? "active" : ""}`} onClick={() => setTab("rendered")}>렌더링</button>
            <button className={`tab ${tab === "latex" ? "active" : ""}`} onClick={() => setTab("latex")}>LaTeX 소스</button>
          </div>

          <div className="result-area">
            {loading && sections.length === 0 ? (
              <div className="loading-state">
                <div className="loading-dots">
                  <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
                </div>
                <div className="loading-text">칠판 내용 분석 중...</div>
              </div>
            ) : sections.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <div className="empty-state-text">사진을 업로드하고 추가하세요</div>
              </div>
            ) : (
              <div className="sections-list">
                {loading && (
                  <div className="loading-inline">
                    <div className="loading-dots">
                      <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
                    </div>
                    <span className="loading-text">분석 중...</span>
                  </div>
                )}
                {sections.map((s, i) => (
                  <div key={s.id} className="section-block">
                    <div className="section-header">
                      <span className="section-num">섹션 {i + 1}</span>
                      {s.summary && <span className="section-summary">{s.summary}</span>}
                    </div>
                    {tab === "rendered"
                      ? <RenderedContent latex={s.latex} />
                      : <div className="raw-content">{s.latex}</div>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
