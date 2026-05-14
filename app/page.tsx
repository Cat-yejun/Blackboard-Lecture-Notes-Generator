"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import katex from "katex";

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

// ── Section Block ────────────────────────────────────────────────
function SectionBlock({ section, index, tab, onDelete, onMove, isFirst, isLast }: {
  section: Section; index: number; tab: string;
  onDelete: () => void; onMove: (dir: -1 | 1) => void;
  isFirst: boolean; isLast: boolean;
}) {
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="section-block">
      <div className="section-header">
        <span className="section-num">섹션 {index + 1}</span>
        {section.summary && (
          <button className="summary-toggle" onClick={() => setShowSummary(v => !v)}>
            {showSummary ? "요약 숨기기 ▲" : "요약 보기 ▼"}
          </button>
        )}
        <div className="section-actions">
          <button onClick={() => onMove(-1)} disabled={isFirst} title="위로">↑</button>
          <button onClick={() => onMove(1)} disabled={isLast} title="아래로">↓</button>
          <button onClick={onDelete} className="del-btn" title="삭제">✕</button>
        </div>
      </div>
      {showSummary && section.summary && (
        <div className="summary-box">{section.summary}</div>
      )}
      {tab === "rendered"
        ? <RenderedContent latex={section.latex} />
        : <div className="raw-content">{section.latex}</div>
      }
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
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

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
      setSections(prev => [...prev, {
        id: Date.now().toString(),
        latex: main.trim(),
        summary: sum?.trim() || "",
        imageUrl: image,
        createdAt: new Date(),
      }]);
      setImage(null); setImageBase64(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: unknown) {
      setError(`네트워크 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setLoading(false); }
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

  const notify = (msg: string) => { setExportMsg(msg); setTimeout(() => setExportMsg(""), 2500); };

  const exportLatex = () => {
    const doc = `\\documentclass{article}
\\usepackage{amsmath,amssymb}
\\usepackage[utf8]{inputenc}
\\title{칠판 필기}
\\date{${new Date().toLocaleDateString("ko-KR")}}
\\begin{document}
\\maketitle
${sections.map((s, i) => `\\section*{섹션 ${i + 1}${s.summary ? ` — ${s.summary}` : ""}}\n${s.latex}`).join("\n\n")}
\\end{document}`;
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([doc], { type: "text/plain" })),
      download: "lecture-notes.tex",
    });
    a.click(); notify("LaTeX 저장됨!");
  };

  const exportMarkdown = () => {
    const doc = `# 칠판 필기\n_${new Date().toLocaleDateString("ko-KR")}_\n\n` +
      sections.map((s, i) => `## 섹션 ${i + 1}${s.summary ? ` — ${s.summary}` : ""}\n\n${s.latex}`).join("\n\n---\n\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([doc], { type: "text/plain" })),
      download: "lecture-notes.md",
    });
    a.click(); notify("Markdown 저장됨!");
  };

  const exportPDF = async () => {
    setPdfLoading(true);
    try {
      // katex CSS 로드 확인 후 print
      const printContent = document.getElementById("print-area");
      if (!printContent) return;

      const win = window.open("", "_blank");
      if (!win) { notify("팝업이 차단됐어요. 팝업 허용 후 다시 시도하세요."); return; }

      // KaTeX CSS 가져오기
      const katexCSS = Array.from(document.styleSheets)
        .map(s => { try { return s.href; } catch { return null; } })
        .filter(Boolean)
        .find(h => h && h.includes("katex"));

      win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>칠판 필기</title>
${katexCSS ? `<link rel="stylesheet" href="${katexCSS}">` : ""}
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans KR', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  .date { color: #888; font-size: 0.85rem; margin-bottom: 2rem; }
  .section { margin-bottom: 2.5rem; page-break-inside: avoid; }
  .section-title { font-size: 1rem; font-weight: 700; color: #333; border-left: 3px solid #34d399; padding-left: 0.75rem; margin-bottom: 0.5rem; }
  .summary { font-size: 0.82rem; color: #666; background: #f5f5f5; padding: 0.5rem 0.75rem; border-radius: 6px; margin-bottom: 0.75rem; }
  .content { line-height: 1.9; font-size: 0.95rem; }
  .katex-display { margin: 1rem 0; }
  hr { border: none; border-top: 1px solid #eee; margin: 2rem 0; }
</style>
</head><body>
<h1>칠판 필기</h1>
<div class="date">${new Date().toLocaleDateString("ko-KR")}</div>
${printContent.innerHTML}
</body></html>`);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); setPdfLoading(false); };
    } catch {
      notify("PDF 생성 중 오류가 발생했어요.");
      setPdfLoading(false);
    }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(sections.map(s => s.latex).join("\n\n---\n\n"));
    notify("전체 복사됨!");
  };

  return (
    <div className="app">
      {/* 숨겨진 PDF 프린트 영역 */}
      <div id="print-area" style={{ display: "none" }} ref={printRef}>
        {sections.map((s, i) => (
          <div key={s.id} className="section">
            <div className="section-title">섹션 {i + 1}{s.summary ? ` — ${s.summary}` : ""}</div>
            {s.summary && <div className="summary">{s.summary}</div>}
            <div className="content">
              {s.latex.split("\n").map((line, j) => (
                <div key={j}>{line ? renderLine(line) : <br />}</div>
              ))}
            </div>
            {i < sections.length - 1 && <hr />}
          </div>
        ))}
      </div>

      <header className="header">
        <div className="header-icon">📐</div>
        <div className="header-text">
          <h1>칠판 → 텍스트 변환기</h1>
          <p>Blackboard OCR · LaTeX · AI-Powered</p>
        </div>
        {sections.length > 0 && (
          <div className="header-actions">
            <span className="section-count">{sections.length}개 섹션</span>
            <button className="export-btn" onClick={exportMarkdown}>📄 MD</button>
            <button className="export-btn" onClick={exportLatex}>📝 TEX</button>
            <button className="export-btn" onClick={exportPDF} disabled={pdfLoading}>
              {pdfLoading ? "⏳ PDF..." : "🖨️ PDF"}
            </button>
            <button className="export-btn accent" onClick={copyAll}>📋 전체복사</button>
            {exportMsg && <span className="export-msg">{exportMsg}</span>}
          </div>
        )}
      </header>

      <main className="main">
        {/* LEFT */}
        <div className="left-panel">
          <div ref={dropRef} className="drop-zone"
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
                    <button onClick={() => moveSection(s.id, -1)} disabled={i === 0}>↑</button>
                    <button onClick={() => moveSection(s.id, 1)} disabled={i === sections.length - 1}>↓</button>
                    <button onClick={() => deleteSection(s.id)} className="del-btn">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="right-panel">
          <div className="tabs">
            <button className={`tab ${tab === "rendered" ? "active" : ""}`} onClick={() => setTab("rendered")}>렌더링</button>
            <button className={`tab ${tab === "latex" ? "active" : ""}`} onClick={() => setTab("latex")}>LaTeX 소스</button>
          </div>

          <div className="result-area">
            {loading && sections.length === 0 ? (
              <div className="loading-state">
                <div className="loading-dots"><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /></div>
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
                    <div className="loading-dots"><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /></div>
                    <span className="loading-text">분석 중...</span>
                  </div>
                )}
                {sections.map((s, i) => (
                  <SectionBlock
                    key={s.id} section={s} index={i} tab={tab}
                    onDelete={() => deleteSection(s.id)}
                    onMove={(dir) => moveSection(s.id, dir)}
                    isFirst={i === 0} isLast={i === sections.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
