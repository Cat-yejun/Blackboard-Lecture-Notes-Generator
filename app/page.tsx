"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import katex from "katex";

interface Section { id: string; latex: string; summary: string; imageUrl: string; createdAt: Date; }
interface User { id: string; username: string; }
interface Folder { id: string; name: string; }
interface NoteSession { id: string; title: string; folder_id: string | null; created_at: string; }
type GalleryView = "grid" | "tree" | "timeline";
type AppScreen = "gallery" | "editor";

// ── LaTeX ────────────────────────────────────────────────────────
function MathDisplay({ math, display }: { math: string; display: boolean }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    try { setHtml(katex.renderToString(math, { displayMode: display, throwOnError: false })); }
    catch { setHtml(""); }
  }, [math, display]);
  if (!html) return <code className={`math-raw${display ? " math-raw-block" : ""}`}>{display ? `$$${math}$$` : `$${math}$`}</code>;
  return <span className={display ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}

// 인라인 파싱: LaTeX + 마크다운 bold/italic/code
function renderInline(line: string) {
  const parts: React.ReactNode[] = [];
  let rest = line, key = 0;
  while (rest.length > 0) {
    // Block math $$...$$
    if (rest.startsWith("$$")) { const end = rest.indexOf("$$", 2); if (end !== -1) { parts.push(<MathDisplay key={key++} math={rest.slice(2, end)} display={true} />); rest = rest.slice(end + 2); continue; } }
    // Inline math $...$
    if (rest.startsWith("$") && rest[1] !== "$") { const end = rest.indexOf("$", 1); if (end !== -1) { parts.push(<MathDisplay key={key++} math={rest.slice(1, end)} display={false} />); rest = rest.slice(end + 1); continue; } }
    // Bold **...**
    if (rest.startsWith("**")) { const end = rest.indexOf("**", 2); if (end !== -1) { parts.push(<strong key={key++}>{rest.slice(2, end)}</strong>); rest = rest.slice(end + 2); continue; } }
    // Italic *...*
    if (rest.startsWith("*") && rest[1] !== "*") { const end = rest.indexOf("*", 1); if (end !== -1) { parts.push(<em key={key++}>{rest.slice(1, end)}</em>); rest = rest.slice(end + 1); continue; } }
    // Inline code `...`
    if (rest.startsWith("`")) { const end = rest.indexOf("`", 1); if (end !== -1) { parts.push(<code key={key++} className="md-code">{rest.slice(1, end)}</code>); rest = rest.slice(end + 1); continue; } }
    // Find next marker
    let next = Infinity;
    const markers = ["$$", "$", "**", "*", "`"];
    for (const m of markers) { const idx = rest.indexOf(m, 1); if (idx > 0) next = Math.min(next, idx); }
    if (next === Infinity) { parts.push(<span key={key++}>{rest}</span>); rest = ""; }
    else { parts.push(<span key={key++}>{rest.slice(0, next)}</span>); rest = rest.slice(next); }
  }
  return parts;
}

function RenderedContent({ latex }: { latex: string }) {
  const lines = latex.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // 구분선 ---
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="md-hr" />);
    // 제목 ###
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="md-h3">{renderInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="md-h2">{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="md-h1">{renderInline(line.slice(2))}</h1>);
    // 순서없는 목록 - item
    } else if (/^[-*] /.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        listItems.push(<li key={i}>{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="md-ul">{listItems}</ul>);
      continue;
    // 순서있는 목록 1. item
    } else if (/^\d+\. /.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        listItems.push(<li key={i}>{renderInline(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="md-ol">{listItems}</ol>);
      continue;
    // 빈 줄
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="md-blank" />);
    // 일반 텍스트
    } else {
      elements.push(<div key={i} className="rendered-line">{renderInline(line)}</div>);
    }
    i++;
  }
  return <div className="rendered-content">{elements}</div>;
}

// 하위 호환
function renderLine(line: string) { return renderInline(line); }

function ImageModal({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return <div className="modal-overlay" onClick={onClose}><div className="modal-content" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={onClose}>✕</button><img src={src} alt="칠판 사진" className="modal-img" /></div></div>;
}

function ImageCropper({ src, onDone, onCancel }: { src: string; onDone: (original: string, masked: string) => void; onCancel: () => void; }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState({ x: 5, y: 5, w: 90, h: 90 });
  const [dragging, setDragging] = useState<null | "move" | "tl" | "tr" | "bl" | "br">(null);
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, crop: { x: 5, y: 5, w: 90, h: 90 } });
  const [tool, setTool] = useState<"crop" | "mask">("crop");
  const [isPainting, setIsPainting] = useState(false);
  const [maskStart, setMaskStart] = useState({ x: 0, y: 0 });
  const [currentMask, setCurrentMask] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [masks, setMasks] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [imgLoaded, setImgLoaded] = useState(false);

  const getImgRect = () => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !imgLoaded) return { left: 0, top: 0, width: 0, height: 0 };
    const cr = container.getBoundingClientRect();
    const scale = Math.min(cr.width / img.naturalWidth, cr.height / img.naturalHeight);
    const rw = img.naturalWidth * scale, rh = img.naturalHeight * scale;
    return { left: (cr.width - rw) / 2, top: (cr.height - rh) / 2, width: rw, height: rh };
  };

  // 포인터 좌표 추출 (마우스/터치 공통)
  const getXY = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { clientX: t.clientX, clientY: t.clientY };
    }
    return { clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY };
  };

  const getPct = (clientX: number, clientY: number) => {
    const ir = getImgRect();
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    return {
      px: ((clientX - rect.left - ir.left) / ir.width) * 100,
      py: ((clientY - rect.top - ir.top) / ir.height) * 100,
    };
  };

  // 크롭 핸들러
  const onCropPointerDown = (e: React.MouseEvent | React.TouchEvent, type: typeof dragging) => {
    if (tool !== "crop") return;
    e.preventDefault(); e.stopPropagation();
    const { clientX, clientY } = getXY(e);
    setDragging(type);
    setDragStart({ mx: clientX, my: clientY, crop: { ...crop } });
  };

  const onContainerPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool !== "mask") return;
    e.preventDefault();
    const { clientX, clientY } = getXY(e);
    const { px, py } = getPct(clientX, clientY);
    setIsPainting(true);
    setMaskStart({ x: px, y: py });
  };

  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const ir = getImgRect();
    if (!ir.width) return;
    const { clientX, clientY } = getXY(e);

    // 마스크 드래그 중 실시간 미리보기
    if (tool === "mask" && isPainting) {
      const { px, py } = getPct(clientX, clientY);
      const nx = Math.min(maskStart.x, px), ny = Math.min(maskStart.y, py);
      setCurrentMask({ x: nx, y: ny, w: Math.abs(px - maskStart.x), h: Math.abs(py - maskStart.y) });
    }

    if (tool === "crop" && dragging) {
      const dx = (clientX - dragStart.mx) / ir.width * 100;
      const dy = (clientY - dragStart.my) / ir.height * 100;
      const c = dragStart.crop; const MIN = 5;
      if (dragging === "move") {
        setCrop({ ...c, x: Math.max(0, Math.min(100 - c.w, c.x + dx)), y: Math.max(0, Math.min(100 - c.h, c.y + dy)) });
      } else if (dragging === "tl") {
        const nx = Math.max(0, Math.min(c.x + c.w - MIN, c.x + dx));
        const ny = Math.max(0, Math.min(c.y + c.h - MIN, c.y + dy));
        setCrop({ x: nx, y: ny, w: c.w + (c.x - nx), h: c.h + (c.y - ny) });
      } else if (dragging === "tr") {
        const ny = Math.max(0, Math.min(c.y + c.h - MIN, c.y + dy));
        setCrop({ x: c.x, y: ny, w: Math.max(MIN, Math.min(100 - c.x, c.w + dx)), h: c.h + (c.y - ny) });
      } else if (dragging === "bl") {
        const nx = Math.max(0, Math.min(c.x + c.w - MIN, c.x + dx));
        setCrop({ x: nx, y: c.y, w: c.w + (c.x - nx), h: Math.max(MIN, Math.min(100 - c.y, c.h + dy)) });
      } else if (dragging === "br") {
        setCrop({ x: c.x, y: c.y, w: Math.max(MIN, Math.min(100 - c.x, c.w + dx)), h: Math.max(MIN, Math.min(100 - c.y, c.h + dy)) });
      }
    }
  };

  const onPointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === "mask" && isPainting) {
      const { clientX, clientY } = getXY(e);
      const { px, py } = getPct(clientX, clientY);
      const nx = Math.min(maskStart.x, px), ny = Math.min(maskStart.y, py);
      const nw = Math.abs(px - maskStart.x), nh = Math.abs(py - maskStart.y);
      if (nw > 1 && nh > 1) setMasks(prev => [...prev, { x: nx, y: ny, w: nw, h: nh }]);
      setIsPainting(false);
      setCurrentMask(null);
    }
    setDragging(null);
  };

  const apply = () => {
    const img = imgRef.current!;
    const canvas = canvasRef.current!;
    const sx = Math.round(crop.x / 100 * img.naturalWidth);
    const sy = Math.round(crop.y / 100 * img.naturalHeight);
    const sw = Math.round(crop.w / 100 * img.naturalWidth);
    const sh = Math.round(crop.h / 100 * img.naturalHeight);
    const rad = rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const rw = sw * cos + sh * sin, rh = sw * sin + sh * cos;
    canvas.width = Math.round(rw); canvas.height = Math.round(rh);
    const ctx = canvas.getContext("2d")!;
    ctx.translate(rw / 2, rh / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    // 마스크 적용 (검은 사각형)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    masks.forEach(m => {
      const mx = Math.round((m.x - crop.x) / crop.w * sw);
      const my = Math.round((m.y - crop.y) / crop.h * sh);
      const mw = Math.round(m.w / crop.w * sw);
      const mh = Math.round(m.h / crop.h * sh);
      ctx.fillStyle = "#000";
      ctx.fillRect(mx, my, mw, mh);
    });
    // 마스크 없는 원본 (저장용)
    const originalCanvas = document.createElement("canvas");
    originalCanvas.width = canvas.width; originalCanvas.height = canvas.height;
    const origCtx = originalCanvas.getContext("2d")!;
    origCtx.translate(rw / 2, rh / 2);
    origCtx.rotate(rad);
    origCtx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    const originalDataUrl = originalCanvas.toDataURL("image/jpeg", 0.92);
    const maskedDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    onDone(originalDataUrl, maskedDataUrl);
  };

  const H: React.CSSProperties = { position: "absolute", width: 14, height: 14, background: "#34d399", border: "2px solid #fff", borderRadius: "50%", cursor: "pointer", zIndex: 2 };
  const ir = imgLoaded ? getImgRect() : { left: 0, top: 0, width: 0, height: 0 };

  return (
    <div className="modal-overlay">
      <div className="cropper-modal" onClick={e => e.stopPropagation()}>
        <div className="sessions-header">
          <span>✂️ 사진 편집</span>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button className="export-btn" onClick={() => setRotation(r => (r - 90 + 360) % 360)}>↺ 회전</button>
            <button className="export-btn" onClick={() => setRotation(r => (r + 90) % 360)}>↻ 회전</button>
            <button className="modal-close" onClick={onCancel}>✕</button>
          </div>
        </div>
        {/* 도구 선택 */}
        <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button className={`export-btn ${tool === "crop" ? "accent" : ""}`} onClick={() => setTool("crop")}>✂️ 크롭</button>
          <button className={`export-btn ${tool === "mask" ? "accent" : ""}`} onClick={() => setTool("mask")}>⬛ 가리기</button>
          {masks.length > 0 && <button className="export-btn" onClick={() => setMasks([])} style={{ marginLeft: "auto" }}>↩ 가리기 초기화</button>}
        </div>
        <div className="cropper-body">
          <div ref={containerRef} className="cropper-container"
            style={{ cursor: tool === "mask" ? "crosshair" : "default", touchAction: "none", userSelect: "none" }}
            onMouseDown={onContainerPointerDown} onTouchStart={onContainerPointerDown}
            onMouseMove={onPointerMove} onTouchMove={e => { e.preventDefault(); onPointerMove(e); }}
            onMouseUp={onPointerUp} onTouchEnd={onPointerUp}
            onMouseLeave={() => { setDragging(null); setIsPainting(false); }}>
            <img ref={imgRef} src={src} alt="편집" className="cropper-img"
              style={{ transform: `rotate(${rotation}deg)` }} draggable={false}
              onLoad={() => { setImgLoaded(true); setCrop({ x: 5, y: 5, w: 90, h: 90 }); }} />
            {/* 마스크 오버레이 */}
            {masks.map((m, i) => (
              <div key={i} style={{
                position: "absolute",
                left: ir.left + m.x / 100 * ir.width,
                top: ir.top + m.y / 100 * ir.height,
                width: m.w / 100 * ir.width,
                height: m.h / 100 * ir.height,
                background: "#000",
                pointerEvents: "none",
                zIndex: 3,
              }} />
            ))}
            {/* 드래그 중 미리보기 박스 */}
            {currentMask && isPainting && (
              <div style={{
                position: "absolute",
                left: ir.left + currentMask.x / 100 * ir.width,
                top: ir.top + currentMask.y / 100 * ir.height,
                width: currentMask.w / 100 * ir.width,
                height: currentMask.h / 100 * ir.height,
                border: "2px dashed rgba(255,100,100,0.9)",
                background: "rgba(0,0,0,0.25)",
                pointerEvents: "none",
                zIndex: 5,
                boxSizing: "border-box",
              }} />
            )}
            {/* 크롭 오버레이 */}
            {tool === "crop" && (
              <div style={{
                position: "absolute",
                left: ir.left + crop.x / 100 * ir.width,
                top: ir.top + crop.y / 100 * ir.height,
                width: crop.w / 100 * ir.width,
                height: crop.h / 100 * ir.height,
                cursor: "move", zIndex: 4,
              }} onMouseDown={e => onCropPointerDown(e, "move")} onTouchStart={e => onCropPointerDown(e, "move")}>
                <div style={{ position: "absolute", inset: 0, border: "2px solid #34d399", pointerEvents: "none" }} />
                <div style={{ ...H, left: 0, top: 0, transform: "translate(-50%,-50%)" }} onMouseDown={e => onCropPointerDown(e, "tl")} onTouchStart={e => onCropPointerDown(e, "tl")} />
                <div style={{ ...H, right: 0, top: 0, transform: "translate(50%,-50%)" }} onMouseDown={e => onCropPointerDown(e, "tr")} onTouchStart={e => onCropPointerDown(e, "tr")} />
                <div style={{ ...H, left: 0, bottom: 0, transform: "translate(-50%,50%)" }} onMouseDown={e => onCropPointerDown(e, "bl")} onTouchStart={e => onCropPointerDown(e, "bl")} />
                <div style={{ ...H, right: 0, bottom: 0, transform: "translate(50%,50%)" }} onMouseDown={e => onCropPointerDown(e, "br")} onTouchStart={e => onCropPointerDown(e, "br")} />
              </div>
            )}
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <canvas ref={maskCanvasRef} style={{ display: "none" }} />
        </div>
        <div style={{ padding: "1rem 1.5rem", display: "flex", gap: "0.75rem" }}>
          <button className="login-btn" style={{ flex: 1 }} onClick={apply}>✓ 적용</button>
          <button className="export-btn" style={{ flex: 1, textAlign: "center", padding: "0.85rem" }} onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  );
}


function SectionBlock({ section, index, tab, onDelete, onMove, onEdit, isFirst, isLast }: { section: Section; index: number; tab: string; onDelete: () => void; onMove: (dir: -1 | 1) => void; onEdit: (latex: string) => void; isFirst: boolean; isLast: boolean; }) {
  const [showSummary, setShowSummary] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(section.latex);

  const commitEdit = () => { onEdit(editVal); setEditing(false); };

  return (
    <div className="section-block">
      {showImage && section.imageUrl && <ImageModal src={section.imageUrl} onClose={() => setShowImage(false)} />}
      <div className="section-header">
        <span className="section-num">섹션 {index + 1}</span>
        {section.imageUrl && <button className="summary-toggle" onClick={() => setShowImage(true)}>🖼️ 사진</button>}
        {section.summary && <button className="summary-toggle" onClick={() => setShowSummary(v => !v)}>{showSummary ? "요약 ▲" : "요약 ▼"}</button>}
        <button className="summary-toggle" onClick={() => { setEditVal(section.latex); setEditing(v => !v); }}>
          {editing ? "편집 닫기" : "✏️ 편집"}
        </button>
        <div className="section-actions">
          <button onClick={() => onMove(-1)} disabled={isFirst}>↑</button>
          <button onClick={() => onMove(1)} disabled={isLast}>↓</button>
          <button onClick={onDelete} className="del-btn">✕</button>
        </div>
      </div>
      {showSummary && section.summary && <div className="summary-box"><RenderedContent latex={section.summary} /></div>}
      {editing ? (
        <div className="edit-area">
          <textarea className="latex-editor" value={editVal} onChange={e => setEditVal(e.target.value)}
            rows={Math.max(6, editVal.split("\n").length + 1)} spellCheck={false} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button className="login-btn" style={{ flex: 1, padding: "0.6rem" }} onClick={commitEdit}>✓ 적용</button>
            <button className="export-btn" style={{ flex: 1, textAlign: "center", padding: "0.6rem" }} onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      ) : (
        tab === "rendered" ? <RenderedContent latex={section.latex} /> : <div className="raw-content">{section.latex}</div>
      )}
    </div>
  );
}

// ── Login ────────────────────────────────────────────────────────
function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const submit = async () => {
    if (!username || !password) { setError("아이디와 비밀번호를 입력해주세요."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, username, password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onLogin(data.user);
    } catch { setError("네트워크 오류"); } finally { setLoading(false); }
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
        <input className="login-input" placeholder="아이디" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        <input className="login-input" type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        {error && <div className="login-error">{error}</div>}
        <button className="login-btn" onClick={submit} disabled={loading}>{loading ? "..." : mode === "login" ? "로그인" : "회원가입"}</button>
      </div>
    </div>
  );
}

// ── Account Dropdown ─────────────────────────────────────────────
function AccountDropdown({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="user-badge" onClick={() => setOpen(v => !v)}>👤 {user.username} ▾</button>
      {open && (
        <div className="account-dropdown">
          <div className="account-dropdown-header">
            <div className="account-avatar">{user.username[0].toUpperCase()}</div>
            <div>
              <div className="account-name">{user.username}</div>
              <div className="account-sub">내 계정</div>
            </div>
          </div>
          <div className="account-dropdown-divider" />
          <button className="account-dropdown-item danger" onClick={() => { setOpen(false); onLogout(); }}>
            🚪 로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

// ── PDF Options ──────────────────────────────────────────────────
function PdfOptionsModal({ onExport, onClose }: { onExport: (opts: { includeSummary: boolean; includeImage: boolean }) => void; onClose: () => void; }) {
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeImage, setIncludeImage] = useState(false);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pdf-options-panel" onClick={e => e.stopPropagation()}>
        <div className="sessions-header"><span>🖨️ PDF 옵션</span><button className="modal-close" onClick={onClose}>✕</button></div>
        <label className="pdf-option"><input type="checkbox" checked={includeSummary} onChange={e => setIncludeSummary(e.target.checked)} /><span>요약 내용 포함</span></label>
        <label className="pdf-option"><input type="checkbox" checked={includeImage} onChange={e => setIncludeImage(e.target.checked)} /><span>원본 사진 포함</span></label>
        <button className="login-btn" style={{ margin: "0.5rem 1.5rem 1.5rem", width: "calc(100% - 3rem)" }} onClick={() => { onExport({ includeSummary, includeImage }); onClose(); }}>PDF 생성</button>
      </div>
    </div>
  );
}

// ── Gallery Screen ───────────────────────────────────────────────
function GalleryScreen({ user, onOpen, onNew, onLogout }: { user: User; onOpen: (s: NoteSession) => void; onNew: () => void; onLogout: () => void; }) {
  const [sessions, setSessions] = useState<NoteSession[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<GalleryView>("grid");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["uncategorized"]));
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [movingSession, setMovingSession] = useState<string | null>(null);
  const [dragSessionId, setDragSessionId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const load = async () => {
    const [sRes, fRes] = await Promise.all([fetch(`/api/sessions?userId=${user.id}`), fetch(`/api/folders?userId=${user.id}`)]);
    const [sData, fData] = await Promise.all([sRes.json(), fRes.json()]);
    setSessions(sData.sessions || []); setFolders(fData.folders || []); setLoading(false);
  };
  useEffect(() => { load(); }, [user.id]);

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("이 필기를 삭제할까요?")) return;
    await fetch("/api/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, name: newFolderName.trim() }) });
    const data = await res.json();
    if (data.folder) { setFolders(prev => [...prev, data.folder]); setNewFolderName(""); setShowNewFolder(false); }
  };

  const deleteFolder = async (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("폴더를 삭제할까요? (필기는 삭제되지 않아요)")) return;
    await fetch("/api/folders", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId }) });
    setFolders(prev => prev.filter(f => f.id !== folderId));
    setSessions(prev => prev.map(s => s.folder_id === folderId ? { ...s, folder_id: null } : s));
  };

  const moveToFolder = async (sessionId: string, folderId: string | null) => {
    // 낙관적 업데이트
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, folder_id: folderId } : s));
    setMovingSession(null);
    // folderOnly: true로 섹션은 건드리지 않음
    await fetch("/api/sessions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, folderId }) });
  };

  // 드래그 앤 드롭
  const onDragStart = (sessionId: string) => setDragSessionId(sessionId);
  const onDragEnd = () => { setDragSessionId(null); setDragOverFolderId(null); };
  const onDragOverFolder = (folderId: string | null, e: React.DragEvent) => { e.preventDefault(); setDragOverFolderId(folderId ?? "uncategorized"); };
  const onDropFolder = (folderId: string | null) => { if (dragSessionId) moveToFolder(dragSessionId, folderId); setDragOverFolderId(null); setDragSessionId(null); };

  const toggleFolder = (id: string) => setExpandedFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const dateStr = (s: NoteSession) => new Date(s.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  const uncategorized = sessions.filter(s => !s.folder_id);
  const byFolder = (folderId: string) => sessions.filter(s => s.folder_id === folderId);

  const SessionCard = ({ s }: { s: NoteSession }) => (
    <div className="gallery-card" draggable onClick={() => onOpen(s)}
      onDragStart={() => onDragStart(s.id)} onDragEnd={onDragEnd}
      style={{ opacity: dragSessionId === s.id ? 0.4 : 1 }}>
      <div className="gallery-card-icon">📄</div>
      <div className="gallery-card-title">{s.title}</div>
      <div className="gallery-card-date">{dateStr(s)}</div>
      <div className="gallery-card-btns">
        <button className="card-action-btn" onClick={e => { e.stopPropagation(); setMovingSession(s.id); }} title="폴더 이동">📁</button>
        <button className="card-action-btn card-del-btn" onClick={e => deleteSession(s.id, e)} title="삭제">✕</button>
      </div>
    </div>
  );

  const FolderHeader = ({ folderId, label, count, onDelete }: { folderId: string | null; label: string; count: number; onDelete?: (e: React.MouseEvent) => void; }) => (
    <div className={`gallery-folder-header ${dragOverFolderId === (folderId ?? "uncategorized") ? "drag-over" : ""}`}
      onClick={() => toggleFolder(folderId ?? "uncategorized")}
      onDragOver={e => onDragOverFolder(folderId, e)}
      onDragLeave={() => setDragOverFolderId(null)}
      onDrop={() => onDropFolder(folderId)}>
      <span>{expandedFolders.has(folderId ?? "uncategorized") ? "▼" : "▶"}</span>
      <span>{label}</span>
      <span className="folder-count">{count}개</span>
      {onDelete && <button className="card-action-btn card-del-btn" style={{ marginLeft: "auto" }} onClick={onDelete}>✕</button>}
    </div>
  );

  const SessionRow = ({ s }: { s: NoteSession }) => (
    <div className="tree-file" draggable onClick={() => onOpen(s)} onDragStart={() => onDragStart(s.id)} onDragEnd={onDragEnd} style={{ opacity: dragSessionId === s.id ? 0.4 : 1 }}>
      <span className="tree-file-icon">📄</span>
      <span className="tree-file-name">{s.title}</span>
      <span className="tree-file-date">{dateStr(s)}</span>
      <button className="card-action-btn" onClick={e => { e.stopPropagation(); setMovingSession(s.id); }}>📁</button>
      <button className="card-action-btn card-del-btn" onClick={e => deleteSession(s.id, e)}>✕</button>
    </div>
  );

  const SessionTimeline = ({ s }: { s: NoteSession }) => (
    <div className="timeline-item" draggable onClick={() => onOpen(s)} onDragStart={() => onDragStart(s.id)} onDragEnd={onDragEnd} style={{ opacity: dragSessionId === s.id ? 0.4 : 1 }}>
      <div className="timeline-dot" />
      <div className="timeline-item-content"><span className="timeline-item-title">{s.title}</span><span className="timeline-item-date">{dateStr(s)}</span></div>
      <button className="card-action-btn" onClick={e => { e.stopPropagation(); setMovingSession(s.id); }}>📁</button>
      <button className="card-action-btn card-del-btn" onClick={e => deleteSession(s.id, e)}>✕</button>
    </div>
  );

  return (
    <div className="gallery-screen">
      {movingSession && (
        <div className="modal-overlay" onClick={() => setMovingSession(null)}>
          <div className="save-modal" onClick={e => e.stopPropagation()}>
            <div className="sessions-header"><span>📁 폴더 이동</span><button className="modal-close" onClick={() => setMovingSession(null)}>✕</button></div>
            <div style={{ padding: "0.75rem 1.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="folder-move-item" onClick={() => moveToFolder(movingSession, null)}>📄 폴더 없음</div>
              {folders.map(f => <div key={f.id} className="folder-move-item" onClick={() => moveToFolder(movingSession, f.id)}>📁 {f.name}</div>)}
            </div>
          </div>
        </div>
      )}

      <div className="gallery-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div className="header-icon" style={{ width: 32, height: 32, fontSize: "1rem" }}>📐</div>
          <div><div style={{ fontWeight: 800, fontSize: "1rem" }}>칠판 필기 변환기</div><div style={{ fontSize: "0.7rem", color: "rgba(232,228,217,0.4)", fontFamily: "JetBrains Mono, monospace" }}>내 필기 갤러리</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <div className="view-toggle">
            <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} title="카드형">⊞</button>
            <button className={view === "tree" ? "active" : ""} onClick={() => setView("tree")} title="폴더형">☰</button>
            <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")} title="타임라인">≡</button>
          </div>
          <button className="export-btn" onClick={() => setShowNewFolder(v => !v)}>📁 새 폴더</button>
          <AccountDropdown user={user} onLogout={onLogout} />
        </div>
      </div>

      {showNewFolder && (
        <div className="new-folder-bar">
          <input className="login-input" style={{ flex: 1, padding: "0.5rem 0.75rem" }} placeholder="폴더 이름 (예: 미적분학)" value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === "Enter" && createFolder()} autoFocus />
          <button className="export-btn accent" onClick={createFolder}>만들기</button>
          <button className="export-btn" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>취소</button>
        </div>
      )}

      <div className="gallery-content">
        {loading ? <div className="sessions-empty" style={{ marginTop: "4rem" }}>불러오는 중...</div>
          : sessions.length === 0 && folders.length === 0 ? (
            <div className="sessions-empty" style={{ marginTop: "4rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📝</div>
              <div>아직 저장된 필기가 없어요</div>
              <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "rgba(232,228,217,0.3)" }}>오른쪽 아래 + 버튼을 눌러 새 필기를 시작하세요</div>
            </div>
          ) : view === "grid" ? (
            <div>
              {folders.map(f => (
                <div key={f.id} className="gallery-folder-section">
                  <FolderHeader folderId={f.id} label={`📁 ${f.name}`} count={byFolder(f.id).length} onDelete={e => deleteFolder(f.id, e)} />
                  {expandedFolders.has(f.id) && <div className="gallery-card-grid">{byFolder(f.id).map(s => <SessionCard key={s.id} s={s} />)}</div>}
                </div>
              ))}
              {uncategorized.length > 0 && (
                <div className="gallery-folder-section">
                  <FolderHeader folderId={null} label="📄 분류 없음" count={uncategorized.length} />
                  {expandedFolders.has("uncategorized") && <div className="gallery-card-grid">{uncategorized.map(s => <SessionCard key={s.id} s={s} />)}</div>}
                </div>
              )}
            </div>
          ) : view === "tree" ? (
            <div className="gallery-tree">
              {folders.map(f => (
                <div key={f.id}>
                  <div className={`tree-folder ${dragOverFolderId === f.id ? "drag-over" : ""}`}
                    onClick={() => toggleFolder(f.id)}
                    onDragOver={e => onDragOverFolder(f.id, e)} onDragLeave={() => setDragOverFolderId(null)} onDrop={() => onDropFolder(f.id)}>
                    <span className="tree-arrow">{expandedFolders.has(f.id) ? "▼" : "▶"}</span>
                    <span className="tree-folder-icon">📁</span>
                    <span className="tree-folder-name">{f.name}</span>
                    <span className="tree-count">{byFolder(f.id).length}개</span>
                    <button className="card-action-btn card-del-btn" onClick={e => deleteFolder(f.id, e)}>✕</button>
                  </div>
                  {expandedFolders.has(f.id) && byFolder(f.id).map(s => <SessionRow key={s.id} s={s} />)}
                </div>
              ))}
              {uncategorized.length > 0 && (
                <div>
                  <div className={`tree-folder ${dragOverFolderId === "uncategorized" ? "drag-over" : ""}`}
                    onClick={() => toggleFolder("uncategorized")}
                    onDragOver={e => onDragOverFolder(null, e)} onDragLeave={() => setDragOverFolderId(null)} onDrop={() => onDropFolder(null)}>
                    <span className="tree-arrow">{expandedFolders.has("uncategorized") ? "▼" : "▶"}</span>
                    <span className="tree-folder-icon">📄</span>
                    <span className="tree-folder-name">분류 없음</span>
                    <span className="tree-count">{uncategorized.length}개</span>
                  </div>
                  {expandedFolders.has("uncategorized") && uncategorized.map(s => <SessionRow key={s.id} s={s} />)}
                </div>
              )}
            </div>
          ) : (
            <div className="gallery-timeline">
              {folders.map(f => byFolder(f.id).length > 0 && (
                <div key={f.id} className="timeline-group">
                  <div className={`timeline-month ${dragOverFolderId === f.id ? "drag-over" : ""}`}
                    onDragOver={e => onDragOverFolder(f.id, e)} onDragLeave={() => setDragOverFolderId(null)} onDrop={() => onDropFolder(f.id)}>
                    📁 {f.name}
                  </div>
                  <div className="timeline-items">{byFolder(f.id).map(s => <SessionTimeline key={s.id} s={s} />)}</div>
                </div>
              ))}
              {uncategorized.length > 0 && (
                <div className="timeline-group">
                  <div className={`timeline-month ${dragOverFolderId === "uncategorized" ? "drag-over" : ""}`}
                    onDragOver={e => onDragOverFolder(null, e)} onDragLeave={() => setDragOverFolderId(null)} onDrop={() => onDropFolder(null)}>
                    📄 분류 없음
                  </div>
                  <div className="timeline-items">{uncategorized.map(s => <SessionTimeline key={s.id} s={s} />)}</div>
                </div>
              )}
            </div>
          )
        }
      </div>
      <button className="fab-btn" onClick={onNew}>＋</button>
    </div>
  );
}

// ── Editor Screen ────────────────────────────────────────────────
function EditorScreen({ user, session, folders, onBack, onSaved }: { user: User; session: NoteSession | null; folders: Folder[]; onBack: () => void; onSaved: () => void; }) {
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<{ data: string; mediaType: string } | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"rendered" | "latex">("rendered");
  const [exportMsg, setExportMsg] = useState("");
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveFolderId, setSaveFolderId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const savedSectionsRef = useRef<string>("");
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, "-").replace(".", "");

  useEffect(() => {
    setSaveTitle(session?.title || today + " ");
    setSaveFolderId(session?.folder_id || null);
    if (session) {
      setLoadingSession(true);
      fetch(`/api/sessions?userId=${user.id}&sessionId=${session.id}`).then(r => r.json()).then(d => {
        const loaded = (d.sections || []).map((s: any) => ({ id: s.id, latex: s.latex, summary: s.summary || "", imageUrl: s.image_url || "", createdAt: new Date(s.created_at) }));
        setSections(loaded);
        savedSectionsRef.current = JSON.stringify(loaded.map((s: Section) => s.latex));
        setLoadingSession(false);
      });
    }
  }, [session]);

  const handleFile = useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.name?.toLowerCase().endsWith(".heic")) {
      setError("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    if (file.type === "image/heic" || file.name?.toLowerCase().endsWith(".heic")) {
      setError("HEIC 파일은 지원되지 않아요. 사진 앱에서 JPEG로 변환 후 업로드해주세요.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const d = e.target!.result as string;
      setCropSrc(d);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  }, []);

  // 클립보드 붙여넣기 (handleFile 선언 이후)
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [handleFile]);

  const handleCropDone = (original: string, masked: string) => {
    setImage(original); // 썸네일/사진보기용: 원본
    setImageBase64({ data: masked.split(",")[1], mediaType: "image/jpeg" }); // AI 분석용: 마스크 적용본
    setShowCropper(false);
    setCropSrc(null);
  };

  const analyze = async () => {
    if (!imageBase64 || !image) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageData: imageBase64.data, mediaType: imageBase64.mediaType }) });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || `오류 ${res.status}`); return; }
      const [main, sum] = (data.text as string).split("---SUMMARY---");
      setSections(prev => [...prev, { id: Date.now().toString(), latex: main.trim(), summary: sum?.trim() || "", imageUrl: image, createdAt: new Date() }]);
      setImage(null); setImageBase64(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: unknown) { setError(`오류: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setLoading(false); }
  };

  const deleteSection = (id: string) => setSections(prev => prev.filter(s => s.id !== id));
  const editSection = (id: string, latex: string) => setSections(prev => prev.map(s => s.id === id ? { ...s, latex } : s));
  const moveSection = (id: string, dir: -1 | 1) => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id); if (idx < 0) return prev;
      const next = idx + dir; if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev]; [arr[idx], arr[next]] = [arr[next], arr[idx]]; return arr;
    });
  };

  const notify = (msg: string) => { setExportMsg(msg); setTimeout(() => setExportMsg(""), 2500); };

  const save = async () => {
    if (!sections.length) return;
    setSaveLoading(true);
    try {
      const res = session
        ? await fetch("/api/sessions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, title: saveTitle, folderId: saveFolderId, sections }) })
        : await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, title: saveTitle, folderId: saveFolderId, sections }) });
      const data = await res.json();
      if (res.ok) { notify("저장 완료!"); setShowSaveModal(false); savedSectionsRef.current = JSON.stringify(sections.map(s => s.latex)); onSaved(); }
      else notify("저장 실패: " + data.error);
    } catch { notify("저장 실패"); } finally { setSaveLoading(false); }
  };

  const exportLatex = () => { const doc = `\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\title{${saveTitle}}\n\\date{${new Date().toLocaleDateString("ko-KR")}}\n\\begin{document}\n\\maketitle\n${sections.map((s, i) => `\\section*{섹션 ${i + 1}}\n${s.latex}`).join("\n\n")}\n\\end{document}`; Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([doc], { type: "text/plain" })), download: `${saveTitle}.tex` }).click(); notify("LaTeX!"); };
  const exportMarkdown = () => { const doc = `# ${saveTitle}\n\n` + sections.map((s, i) => `## 섹션 ${i + 1}\n\n${s.latex}`).join("\n\n---\n\n"); Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([doc], { type: "text/plain" })), download: `${saveTitle}.md` }).click(); notify("Markdown!"); };
  const exportPDF = ({ includeSummary, includeImage }: { includeSummary: boolean; includeImage: boolean }) => {
    const win = window.open("", "_blank"); if (!win) { notify("팝업 차단됨"); return; }
    const katexCSS = Array.from(document.styleSheets).map(s => { try { return s.href; } catch { return null; } }).filter(Boolean).find(h => h && h.includes("katex"));

    const renderInlineHtml = (text: string) => {
      return text
        .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => { try { return katex.renderToString(m, { displayMode: true, throwOnError: false }); } catch { return "$$" + m + "$$"; } })
        .replace(/\$([^$\n]+?)\$/g, (_, m) => { try { return katex.renderToString(m, { displayMode: false, throwOnError: false }); } catch { return "$" + m + "$"; } })
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>");
    };

    const renderMarkdownHtml = (text: string) => {
      const lines = text.split("\n");
      let out = "";
      let i = 0;
      while (i < lines.length) {
        const l = lines[i];
        if (/^---+$/.test(l.trim())) { out += "<hr>"; }
        else if (l.startsWith("### ")) { out += "<h3>" + renderInlineHtml(l.slice(4)) + "</h3>"; }
        else if (l.startsWith("## ")) { out += "<h2>" + renderInlineHtml(l.slice(3)) + "</h2>"; }
        else if (l.startsWith("# ")) { out += "<h1 class='md-h1'>" + renderInlineHtml(l.slice(2)) + "</h1>"; }
        else if (/^[-*] /.test(l)) {
          out += "<ul>";
          while (i < lines.length && /^[-*] /.test(lines[i])) { out += "<li>" + renderInlineHtml(lines[i].slice(2)) + "</li>"; i++; }
          out += "</ul>"; continue;
        } else if (/^\d+\. /.test(l)) {
          out += "<ol>";
          while (i < lines.length && /^\d+\. /.test(lines[i])) { out += "<li>" + renderInlineHtml(lines[i].replace(/^\d+\. /, "")) + "</li>"; i++; }
          out += "</ol>"; continue;
        } else if (l.trim() === "") { out += "<br>"; }
        else { out += "<div>" + renderInlineHtml(l) + "</div>"; }
        i++;
      }
      return out;
    };

    const html = sections.map((s, i) => {
      const renderedLatex = renderMarkdownHtml(s.latex);
      const renderedSummary = includeSummary && s.summary ? "<div class='sum'>" + renderMarkdownHtml(s.summary) + "</div>" : "";
      const img = includeImage && s.imageUrl ? "<img src='" + s.imageUrl + "' style='max-width:100%;border-radius:8px;margin-bottom:.75rem'/>" : "";
      const divider = i < sections.length - 1 ? "<hr class='section-divider'>" : "";
      return "<div class='section'><div class='st'>섹션 " + (i+1) + "</div>" + renderedSummary + img + "<div>" + renderedLatex + "</div>" + divider + "</div>";
    }).join("");

    const css = "body{font-family:sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a;line-height:1.7} h1{font-size:1.5rem;margin-bottom:.25rem} h2{font-size:1.15rem;font-weight:700;margin:1rem 0 .4rem;border-bottom:1px solid #eee;padding-bottom:.2rem} h3{font-size:1rem;font-weight:700;margin:.7rem 0 .3rem} .date{color:#888;font-size:.85rem;margin-bottom:2rem} .section{margin-bottom:2.5rem;page-break-inside:avoid} .st{font-weight:700;border-left:3px solid #34d399;padding-left:.75rem;margin-bottom:.75rem} .sum{font-size:.85rem;color:#444;background:#f7f7f7;padding:.6rem .9rem;border-radius:6px;margin-bottom:.75rem} ul,ol{padding-left:1.5rem;margin:.4rem 0} li{margin:.15rem 0} code{font-family:monospace;font-size:.88em;background:#f0f0f0;padding:.1em .35em;border-radius:3px} hr{border:none;border-top:1px solid #eee;margin:1rem 0} .section-divider{border:none;border-top:2px solid #eee;margin:2rem 0} .katex-display{margin:1rem 0} .md-h1{font-size:1.3rem}";

    const katexLink = katexCSS ? "<link rel='stylesheet' href='" + katexCSS + "'>" : "";
    win.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + saveTitle + "</title>" + katexLink + "<style>" + css + "</style></head><body><h1>" + saveTitle + "</h1><div class='date'>" + new Date().toLocaleDateString("ko-KR") + "</div>" + html + "</body></html>");
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  };

  const copyAll = () => { navigator.clipboard.writeText(sections.map(s => s.latex).join("\n\n---\n\n")); notify("복사됨!"); };

  return (
    <div className="app">
      {showPdfOptions && <PdfOptionsModal onExport={exportPDF} onClose={() => setShowPdfOptions(false)} />}
      {showCropper && cropSrc && <ImageCropper src={cropSrc} onDone={handleCropDone} onCancel={() => { setShowCropper(false); setCropSrc(null); }} />}

      {showUnsavedModal && (
        <div className="modal-overlay" onClick={() => setShowUnsavedModal(false)}>
          <div className="save-modal" onClick={e => e.stopPropagation()}>
            <div className="sessions-header"><span>⚠️ 저장하지 않은 변경사항</span><button className="modal-close" onClick={() => setShowUnsavedModal(false)}>✕</button></div>
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontSize: "0.88rem", color: "rgba(232,228,217,0.7)", lineHeight: 1.6 }}>저장하지 않은 내용이 있어요. 갤러리로 이동할까요?</p>
              <button className="login-btn" onClick={() => { setShowUnsavedModal(false); setShowSaveModal(true); }}>💾 저장하고 이동</button>
              <button className="export-btn" style={{ textAlign: "center", padding: "0.7rem" }} onClick={() => { setShowUnsavedModal(false); onBack(); }}>저장 안 하고 이동</button>
            </div>
          </div>
        </div>
      )}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="save-modal" onClick={e => e.stopPropagation()}>
            <div className="sessions-header"><span>💾 저장</span><button className="modal-close" onClick={() => setShowSaveModal(false)}>✕</button></div>
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ fontSize: "0.8rem", color: "rgba(232,228,217,0.5)", fontFamily: "JetBrains Mono, monospace" }}>파일 이름</label>
              <input className="login-input" value={saveTitle} onChange={e => setSaveTitle(e.target.value)} placeholder="예: 2026-05-14 미적분학" />
              <label style={{ fontSize: "0.8rem", color: "rgba(232,228,217,0.5)", fontFamily: "JetBrains Mono, monospace" }}>폴더</label>
              <select className="login-input" value={saveFolderId || ""} onChange={e => setSaveFolderId(e.target.value || null)} style={{ cursor: "pointer" }}>
                <option value="">폴더 없음</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <button className="login-btn" onClick={save} disabled={saveLoading}>{saveLoading ? "저장 중..." : session ? "수정 저장" : "새로 저장"}</button>
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <button className="back-btn" onClick={() => {
          const hasUnsaved = sections.length > 0 && JSON.stringify(sections.map(s => s.latex)) !== savedSectionsRef.current;
          if (hasUnsaved) setShowUnsavedModal(true);
          else onBack();
        }}>← 갤러리</button>
        <div className="header-text" style={{ flex: 1 }}>
          <h1 style={{ fontSize: "0.95rem" }}>{saveTitle || "새 필기"}</h1>
          <p>{session ? "기존 필기 수정 중" : "새 필기"}</p>
        </div>
        <div className="header-actions">
          {sections.length > 0 && <>
            <span className="section-count">{sections.length}개</span>
            <button className="export-btn" onClick={exportMarkdown}>📄 MD</button>
            <button className="export-btn" onClick={exportLatex}>📝 TEX</button>
            <button className="export-btn" onClick={() => setShowPdfOptions(true)}>🖨️ PDF</button>
            <button className="export-btn" onClick={copyAll}>📋 복사</button>
            <button className="export-btn accent" onClick={() => setShowSaveModal(true)}>💾 저장</button>
          </>}
          {exportMsg && <span className="export-msg">{exportMsg}</span>}
        </div>
      </header>

      <main className="main">
        <div className="left-panel">
          <div ref={dropRef} className="drop-zone"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add("drag-over"); }}
            onDragLeave={() => dropRef.current?.classList.remove("drag-over")}
            onDrop={e => { e.preventDefault(); dropRef.current?.classList.remove("drag-over"); handleFile(e.dataTransfer.files[0]); }}>
            {image ? <img src={image} alt="미리보기" /> : <div className="drop-placeholder"><div className="drop-icon">🖼️</div><div className="drop-label">칠판 사진을 업로드하세요</div><div className="drop-sub">클릭하여 선택 · drag & drop · Ctrl+V</div></div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0])} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="analyze-btn" style={{ flex: 1 }} onClick={analyze} disabled={!imageBase64 || loading}>
              {loading ? <><div className="spinner" />분석 중...</> : <>✨ 필기에 추가</>}
            </button>
            {image && (
              <button className="reset-img-btn" onClick={() => { setImage(null); setImageBase64(null); if (fileRef.current) fileRef.current.value = ""; }} title="이미지 초기화">✕</button>
            )}
          </div>
          <button className="export-btn" style={{ width: "100%", textAlign: "center", padding: "0.65rem" }}
            onClick={() => setSections(prev => [...prev, { id: Date.now().toString(), latex: "", summary: "", imageUrl: "", createdAt: new Date() }])}>
            ✏️ 빈 섹션 추가 (직접 입력)
          </button>
          {error && <div className="error-msg">{error}</div>}
          {sections.length > 0 && (
            <div className="thumb-list">
              <div className="thumb-title">섹션 목록 ({sections.length})</div>
              {sections.map((s, i) => (
                <div key={s.id} className="thumb-item">
                  {s.imageUrl && <img src={s.imageUrl} alt={`섹션 ${i+1}`} className="thumb-img" />}
                  <div className="thumb-info"><span className="thumb-num">#{i + 1}</span><span className="thumb-sum">{s.summary || "내용 없음"}</span></div>
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
            {loadingSession ? <div className="loading-state"><div className="loading-dots"><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /></div><div className="loading-text">불러오는 중...</div></div>
              : loading && sections.length === 0 ? <div className="loading-state"><div className="loading-dots"><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /></div><div className="loading-text">분석 중...</div></div>
              : sections.length === 0 ? <div className="empty-state"><div className="empty-state-icon">📝</div><div className="empty-state-text">사진을 업로드하고 추가하세요</div></div>
              : <div className="sections-list">
                  {loading && <div className="loading-inline"><div className="loading-dots"><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /></div><span className="loading-text">분석 중...</span></div>}
                  {sections.map((s, i) => <SectionBlock key={s.id} section={s} index={i} tab={tab} onDelete={() => deleteSection(s.id)} onMove={dir => moveSection(s.id, dir)} onEdit={latex => editSection(s.id, latex)} isFirst={i === 0} isLast={i === sections.length - 1} />)}
                </div>
            }
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<AppScreen>("gallery");
  const [currentSession, setCurrentSession] = useState<NoteSession | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => { const s = localStorage.getItem("bbocr_user"); if (s) setUser(JSON.parse(s)); }, []);

  const handleLogin = (u: User) => {
    setUser(u); localStorage.setItem("bbocr_user", JSON.stringify(u));
    fetch(`/api/folders?userId=${u.id}`).then(r => r.json()).then(d => setFolders(d.folders || []));
  };
  const handleLogout = () => { setUser(null); localStorage.removeItem("bbocr_user"); setScreen("gallery"); };
  const openSession = (s: NoteSession) => { setCurrentSession(s); setScreen("editor"); };
  const newSession = () => { setCurrentSession(null); setScreen("editor"); };
  const goBack = () => { setScreen("gallery"); setCurrentSession(null); };
  const onSaved = () => { if (user) fetch(`/api/folders?userId=${user.id}`).then(r => r.json()).then(d => setFolders(d.folders || [])); };

  if (!user) return <LoginPanel onLogin={handleLogin} />;
  if (screen === "gallery") return <GalleryScreen user={user} onOpen={openSession} onNew={newSession} onLogout={handleLogout} />;
  return <EditorScreen user={user} session={currentSession} folders={folders} onBack={goBack} onSaved={onSaved} />;
}
