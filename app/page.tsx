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
interface User { id: string; username: string; }
interface NoteSession { id: string; title: string; created_at: string; }

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

// ── Image Modal ──────────────────────────────────────────────────
function ImageModal({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <img src={src} alt="칠판 사진" className="modal-img" />
      </div>
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
  const [showImage, setShowImage] = useState(false);
  return (
    <div className="section-block">
      {showImage && section.imageUrl && <ImageModal src={section.imageUrl} onClose={() => setShowImage(false)} />}
      <div className="section-header">
        <span className="section-num">섹션 {index + 1}</span>
        {section.imageUrl && (
          <button className="summary-toggle" onClick={() => setShowImage(true)}>🖼️ 사진 보기</button>
        )}
        {section.summary && (
          <button className="summary-toggle" onClick={() => setShowSummary(v => !v)}>
            {showSummary ? "요약 숨기기 ▲" : "요약 보기 ▼"}
          </button>
        )}
        <div className="section-actions">
          <button onClick={() => onMove(-1)} disabled={isFirst}>↑</button>
          <button onClick={() => onMove(1)} disabled={isLast}>↓</button>
          <button onClick={onDelete} className="del-btn">✕</button>
        </div>
      </div>
      {showSummary && section.summary && <div className="summary-box">{section.summary}</div>}
      {tab === "rendered" ? <RenderedContent latex={section.latex} /> : <div className="raw-content">{section.latex}</div>}
    </div>
  );
}

// ── Login Panel ──────────────────────────────────────────────────
function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!username || !password) { setError("아이디와 비밀번호를 입력해주세요."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onLogin(data.user);
    } catch { setError("네트워크 오류"); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-panel">
      <div className="login-box">
        <div className="login-icon">📐</div>
        <h2 className="login-title">칠판 필기 변환기</h2>
        <div className="login-tabs">
          <button className={`login-tab ${mode === "login" ? "active" : ""}`} onClick={() => { setMode("login"); setError(""); }}>로그인</button>
          <button className={`login-tab ${mode === "register" ? "active" : ""}`} onClick={() => { setMode("register"); setError(""); }}>회원가입</button>
        </div>
        <input className="login-input" placeholder="아이디" value={username} onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()} />
        <input className="login-input" type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()} />
        {error && <div className="login-error">{error}</div>}
        <button className="login-btn" onClick={submit} disabled={loading}>
          {loading ? "..." : mode === "login" ? "로그인" : "회원가입"}
        </button>
      </div>
    </div>
  );
}

// ── Sessions Panel ───────────────────────────────────────────────
function SessionsPanel({ user, onLoad, onClose }: {
  user: User;
  onLoad: (sections: Section[]) => void;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<NoteSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions?userId=${user.id}`)
      .then(r => r.json())
      .then(d => { setSessions(d.sessions || []); setLoading(false); });
  }, [user.id]);

  const loadSession = async (sessionId: string) => {
    const res = await fetch(`/api/sessions?userId=${user.id}&sessionId=${sessionId}`);
    const data = await res.json();
    const loaded: Section[] = (data.sections || []).map((s: any) => ({
      id: s.id,
      latex: s.latex,
      summary: s.summary || "",
      imageUrl: s.image_url || "",
      createdAt: new Date(s.created_at),
    }));
    onLoad(loaded);
    onClose();
  };

  const deleteSession = async (sessionId: string) => {
    await fetch("/api/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sessions-panel" onClick={e => e.stopPropagation()}>
        <div className="sessions-header">
          <span>저장된 필기</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {loading ? <div className="sessions-empty">불러오는 중...</div>
          : sessions.length === 0 ? <div className="sessions-empty">저장된 필기가 없어요</div>
          : sessions.map(s => (
            <div key={s.id} className="session-item">
              <div className="session-item-info" onClick={() => loadSession(s.id)}>
                <div className="session-item-title">{s.title}</div>
                <div className="session-item-date">{new Date(s.created_at).toLocaleDateString("ko-KR")}</div>
              </div>
              <button className="del-btn session-del" onClick={() => deleteSession(s.id)}>✕</button>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── PDF Export Options Modal ─────────────────────────────────────
function PdfOptionsModal({ onExport, onClose }: {
  onExport: (opts: { includeSummary: boolean; includeImage: boolean }) => void;
  onClose: () => void;
}) {
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeImage, setIncludeImage] = useState(false);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pdf-options-panel" onClick={e => e.stopPropagation()}>
        <div className="sessions-header">
          <span>🖨️ PDF 내보내기 옵션</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <label className="pdf-option">
          <input type="checkbox" checked={includeSummary} onChange={e => setIncludeSummary(e.target.checked)} />
          <span>요약 내용 포함</span>
        </label>
        <label className="pdf-option">
          <input type="checkbox" checked={includeImage} onChange={e => setIncludeImage(e.target.checked)} />
          <span>원본 사진 포함</span>
        </label>
        <button className="login-btn" style={{ marginTop: "1rem" }} onClick={() => { onExport({ includeSummary, includeImage }); onClose(); }}>
          PDF 생성
        </button>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<{ data: string; mediaType: string } | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"rendered" | "latex">("rendered");
  const [exportMsg, setExportMsg] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // 로컬스토리지에서 로그인 상태 복원
  useEffect(() => {
    const saved = localStorage.getItem("bbocr_user");
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem("bbocr_user", JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("bbocr_user");
  };

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

  const saveSession = async () => {
    if (!user || !sections.length) return;
    setSaveLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          title: `필기 ${new Date().toLocaleDateString("ko-KR")}`,
          sections,
        }),
      });
      const data = await res.json();
      if (data.sessionId) notify("저장 완료!");
      else notify("저장 실패");
    } catch { notify("저장 실패"); }
    finally { setSaveLoading(false); }
  };

  const exportLatex = () => {
    const doc = `\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\usepackage[utf8]{inputenc}\n\\title{칠판 필기}\n\\date{${new Date().toLocaleDateString("ko-KR")}}\n\\begin{document}\n\\maketitle\n${sections.map((s, i) => `\\section*{섹션 ${i + 1}${s.summary ? ` — ${s.summary}` : ""}}\n${s.latex}`).join("\n\n")}\n\\end{document}`;
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([doc], { type: "text/plain" })), download: "lecture-notes.tex" });
    a.click(); notify("LaTeX 저장됨!");
  };

  const exportMarkdown = () => {
    const doc = `# 칠판 필기\n_${new Date().toLocaleDateString("ko-KR")}_\n\n` +
      sections.map((s, i) => `## 섹션 ${i + 1}${s.summary ? ` — ${s.summary}` : ""}\n\n${s.latex}`).join("\n\n---\n\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([doc], { type: "text/plain" })), download: "lecture-notes.md" });
    a.click(); notify("Markdown 저장됨!");
  };

  const exportPDF = ({ includeSummary, includeImage }: { includeSummary: boolean; includeImage: boolean }) => {
    const printContent = document.getElementById("print-area-data");
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) { notify("팝업 차단됨. 허용 후 다시 시도하세요."); return; }
    const katexCSS = Array.from(document.styleSheets).map(s => { try { return s.href; } catch { return null; } }).filter(Boolean).find(h => h && h.includes("katex"));
    const sectionsHtml = sections.map((s, i) => `
      <div class="section">
        <div class="section-title">섹션 ${i + 1}${s.summary ? ` — ${s.summary}` : ""}</div>
        ${includeSummary && s.summary ? `<div class="summary">${s.summary}</div>` : ""}
        ${includeImage && s.imageUrl ? `<img src="${s.imageUrl}" class="section-img" />` : ""}
        <div class="content">${s.latex.split("\n").map(line => `<div>${line || "<br>"}</div>`).join("")}</div>
        ${i < sections.length - 1 ? "<hr>" : ""}
      </div>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>칠판 필기</title>
      ${katexCSS ? `<link rel="stylesheet" href="${katexCSS}">` : ""}
      <style>
        body{font-family:sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a}
        h1{font-size:1.6rem;margin-bottom:.25rem}.date{color:#888;font-size:.85rem;margin-bottom:2rem}
        .section{margin-bottom:2.5rem;page-break-inside:avoid}
        .section-title{font-weight:700;border-left:3px solid #34d399;padding-left:.75rem;margin-bottom:.5rem}
        .summary{font-size:.82rem;color:#666;background:#f5f5f5;padding:.5rem .75rem;border-radius:6px;margin-bottom:.75rem}
        .section-img{max-width:100%;border-radius:8px;margin-bottom:.75rem}
        .content{line-height:1.9}.katex-display{margin:1rem 0}
        hr{border:none;border-top:1px solid #eee;margin:2rem 0}
      </style></head><body>
      <h1>칠판 필기</h1><div class="date">${new Date().toLocaleDateString("ko-KR")}</div>
      ${sectionsHtml}</body></html>`);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  };

  const copyAll = () => {
    navigator.clipboard.writeText(sections.map(s => s.latex).join("\n\n---\n\n"));
    notify("전체 복사됨!");
  };

  if (!user) return <LoginPanel onLogin={handleLogin} />;

  return (
    <div className="app">
      <div id="print-area-data" style={{ display: "none" }} />

      {showSessions && <SessionsPanel user={user} onLoad={setSections} onClose={() => setShowSessions(false)} />}
      {showPdfOptions && <PdfOptionsModal onExport={exportPDF} onClose={() => setShowPdfOptions(false)} />}

      <header className="header">
        <div className="header-icon">📐</div>
        <div className="header-text">
          <h1>칠판 → 텍스트 변환기</h1>
          <p>Blackboard OCR · LaTeX · AI-Powered</p>
        </div>
        <div className="header-actions">
          {sections.length > 0 && <>
            <span className="section-count">{sections.length}개 섹션</span>
            <button className="export-btn" onClick={exportMarkdown}>📄 MD</button>
            <button className="export-btn" onClick={exportLatex}>📝 TEX</button>
            <button className="export-btn" onClick={() => setShowPdfOptions(true)}>🖨️ PDF</button>
            <button className="export-btn" onClick={copyAll}>📋 복사</button>
            <button className="export-btn accent" onClick={saveSession} disabled={saveLoading}>
              {saveLoading ? "저장 중..." : "💾 저장"}
            </button>
          </>}
          <button className="export-btn" onClick={() => setShowSessions(true)}>📂 불러오기</button>
          <span className="user-badge" onClick={handleLogout} title="클릭하여 로그아웃">👤 {user.username}</span>
          {exportMsg && <span className="export-msg">{exportMsg}</span>}
        </div>
      </header>

      <main className="main">
        <div className="left-panel">
          <div ref={dropRef} className="drop-zone"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add("drag-over"); }}
            onDragLeave={() => dropRef.current?.classList.remove("drag-over")}
            onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove("drag-over"); handleFile(e.dataTransfer.files[0]); }}
          >
            {image ? <img src={image} alt="칠판 미리보기" />
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
                  <SectionBlock key={s.id} section={s} index={i} tab={tab}
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
