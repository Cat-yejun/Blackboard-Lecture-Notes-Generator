import { useState, useRef, useCallback, useEffect } from "react";

const SYSTEM_PROMPT = `당신은 칠판/화이트보드 사진을 분석하는 전문 AI입니다.
이미지에서 텍스트와 수식을 정확하게 추출하고 다음 형식으로 출력하세요:

규칙:
1. 일반 텍스트는 그대로 출력
2. 수학 공식/수식은 반드시 LaTeX로 변환 (인라인: $수식$, 블록: $$수식$$)
3. 줄바꿈과 단락 구조를 최대한 원본에 맞게 유지
4. 읽기 어려운 부분은 [불명확] 표시
5. 그리스 문자, 적분, 행렬, 분수 등 모두 LaTeX로 표현

예시:
- 이차방정식: $$ax^2 + bx + c = 0$$
- 근의 공식: $$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$
- 오일러 공식: $$e^{i\pi} + 1 = 0$$

LaTeX 출력 후, 마지막에 ---SUMMARY--- 구분자를 넣고 한 줄로 내용 요약을 추가하세요.`;

function renderLatex(text) {
  // Split by block math ($$...$$) and inline math ($...$)
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const blockIdx = remaining.indexOf("$$");
    const inlineIdx = remaining.indexOf("$");

    if (blockIdx === 0) {
      const end = remaining.indexOf("$$", 2);
      if (end !== -1) {
        const math = remaining.slice(2, end);
        parts.push(
          <span key={key++} className="math-block">
            <MathDisplay math={math} display={true} />
          </span>
        );
        remaining = remaining.slice(end + 2);
        continue;
      }
    }

    if (inlineIdx === 0 && remaining[1] !== "$") {
      const end = remaining.indexOf("$", 1);
      if (end !== -1) {
        const math = remaining.slice(1, end);
        parts.push(
          <MathDisplay key={key++} math={math} display={false} />
        );
        remaining = remaining.slice(end + 1);
        continue;
      }
    }

    // Find next math marker
    let nextMath = Infinity;
    if (blockIdx > 0) nextMath = Math.min(nextMath, blockIdx);
    if (inlineIdx > 0) nextMath = Math.min(nextMath, inlineIdx);

    if (nextMath === Infinity) {
      parts.push(<span key={key++}>{remaining}</span>);
      remaining = "";
    } else {
      parts.push(<span key={key++}>{remaining.slice(0, nextMath)}</span>);
      remaining = remaining.slice(nextMath);
    }
  }

  return parts;
}

function MathDisplay({ math, display }) {
  const [rendered, setRendered] = useState(null);

  useEffect(() => {
    try {
      if (window.katex) {
        const html = window.katex.renderToString(math, {
          displayMode: display,
          throwOnError: false,
          errorColor: "#ff6b6b",
        });
        setRendered(html);
      }
    } catch (e) {
      setRendered(null);
    }
  }, [math, display]);

  if (rendered) {
    return (
      <span
        className={display ? "math-display" : "math-inline"}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    );
  }

  return (
    <code className={display ? "math-display-raw" : "math-inline-raw"}>
      {display ? `$$${math}$$` : `$${math}$`}
    </code>
  );
}

export default function BlackboardOCR() {
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("rendered");
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setResult(null);
    setSummary(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(",")[1];
      setImage(dataUrl);
      setImageBase64({ data: base64, mediaType: file.type });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      dropRef.current?.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  const analyze = async () => {
    if (!imageBase64) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSummary(null);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: imageBase64.mediaType,
                    data: imageBase64.data,
                  },
                },
                {
                  type: "text",
                  text: "이 칠판/화이트보드 이미지의 내용을 LaTeX를 포함한 텍스트로 변환해주세요.",
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData?.error?.message || `HTTP ${response.status}`;
        setError(`API 오류: ${msg}`);
        return;
      }

      const data = await response.json();

      if (data.error) {
        setError(`오류: ${data.error.message}`);
        return;
      }

      const fullText = data.content?.map((b) => b.text || "").join("") || "";

      if (!fullText) {
        setError("응답이 비어 있습니다. 다시 시도해주세요.");
        return;
      }

      const [mainContent, summaryPart] = fullText.split("---SUMMARY---");
      setResult(mainContent.trim());
      setSummary(summaryPart?.trim() || null);
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError("네트워크 오류: API에 연결할 수 없습니다. Claude.ai artifact 환경에서 실행 중인지 확인하세요.");
      } else {
        setError(`오류 발생: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyLatex = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resultLines = result?.split("\n") || [];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        @import url('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0a0a0f;
          color: #e8e4d9;
          font-family: 'Syne', sans-serif;
          min-height: 100vh;
        }

        .app {
          min-height: 100vh;
          background: #0a0a0f;
          display: flex;
          flex-direction: column;
        }

        /* Chalk texture overlay */
        .app::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            radial-gradient(ellipse 80% 50% at 20% 30%, rgba(52, 211, 153, 0.04) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 70%, rgba(99, 179, 237, 0.04) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }

        .header {
          position: relative;
          z-index: 1;
          padding: 2rem 2.5rem 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #34d399, #60a5fa);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          flex-shrink: 0;
        }

        .header-text h1 {
          font-size: 1.3rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #f0ece0;
        }

        .header-text p {
          font-size: 0.75rem;
          color: rgba(232,228,217,0.4);
          margin-top: 1px;
          font-family: 'JetBrains Mono', monospace;
        }

        .main {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          flex: 1;
          height: calc(100vh - 85px);
        }

        /* LEFT PANEL */
        .left-panel {
          border-right: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          gap: 1rem;
        }

        .drop-zone {
          flex: 1;
          border: 1.5px dashed rgba(255,255,255,0.12);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
          background: rgba(255,255,255,0.02);
          min-height: 200px;
        }

        .drop-zone:hover, .drop-zone.drag-over {
          border-color: rgba(52, 211, 153, 0.5);
          background: rgba(52, 211, 153, 0.04);
        }

        .drop-zone img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 14px;
        }

        .drop-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          pointer-events: none;
        }

        .drop-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.6rem;
        }

        .drop-label {
          font-size: 0.9rem;
          font-weight: 600;
          color: rgba(232,228,217,0.7);
        }

        .drop-sub {
          font-size: 0.72rem;
          color: rgba(232,228,217,0.3);
          font-family: 'JetBrains Mono', monospace;
        }

        .analyze-btn {
          width: 100%;
          padding: 0.9rem;
          border-radius: 12px;
          border: none;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 0.9rem;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: all 0.2s;
          background: linear-gradient(135deg, #34d399, #60a5fa);
          color: #0a0a0f;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .analyze-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          background: rgba(255,255,255,0.1);
          color: rgba(232,228,217,0.4);
        }

        .analyze-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(52, 211, 153, 0.3);
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(10,10,15,0.3);
          border-top-color: #0a0a0f;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* RIGHT PANEL */
        .right-panel {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .tabs {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 0 1.5rem;
          gap: 0;
        }

        .tab {
          padding: 1rem 1.2rem 0.9rem;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: rgba(232,228,217,0.35);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.15s;
          text-transform: uppercase;
          background: none;
          border-left: none;
          border-right: none;
          border-top: none;
          font-family: 'JetBrains Mono', monospace;
        }

        .tab.active {
          color: #34d399;
          border-bottom-color: #34d399;
        }

        .tab:hover:not(.active) {
          color: rgba(232,228,217,0.6);
        }

        .result-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }

        .empty-state {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          color: rgba(232,228,217,0.2);
        }

        .empty-state-icon {
          font-size: 2.5rem;
          opacity: 0.5;
        }

        .empty-state-text {
          font-size: 0.85rem;
          font-family: 'JetBrains Mono', monospace;
        }

        /* Rendered output */
        .rendered-content {
          line-height: 1.8;
          font-size: 0.95rem;
          color: #e8e4d9;
        }

        .rendered-content .math-display {
          display: block;
          margin: 1rem 0;
          text-align: center;
        }

        .math-display-raw, .math-inline-raw {
          font-family: 'JetBrains Mono', monospace;
          background: rgba(52, 211, 153, 0.1);
          padding: 0 4px;
          border-radius: 4px;
          color: #34d399;
          font-size: 0.88em;
        }

        .math-display-raw {
          display: block;
          margin: 0.75rem 0;
          padding: 0.5rem;
          text-align: center;
        }

        .katex-display {
          margin: 1rem 0 !important;
        }

        /* Raw LaTeX */
        .raw-content {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.82rem;
          line-height: 1.9;
          color: #a8e6cf;
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* Summary */
        .summary-bar {
          margin: 1rem 1.5rem 0;
          padding: 0.75rem 1rem;
          background: rgba(52, 211, 153, 0.08);
          border: 1px solid rgba(52, 211, 153, 0.2);
          border-radius: 10px;
          font-size: 0.8rem;
          color: rgba(52, 211, 153, 0.85);
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
          font-family: 'JetBrains Mono', monospace;
        }

        .summary-label {
          color: #34d399;
          font-weight: 600;
          flex-shrink: 0;
        }

        .copy-btn {
          margin: 0 1.5rem 1rem;
          padding: 0.6rem 1rem;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: rgba(232,228,217,0.6);
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          align-self: flex-start;
        }

        .copy-btn:hover {
          border-color: rgba(52, 211, 153, 0.3);
          color: #34d399;
        }

        .error-msg {
          padding: 1rem;
          background: rgba(255, 107, 107, 0.08);
          border: 1px solid rgba(255, 107, 107, 0.2);
          border-radius: 10px;
          color: #ff9999;
          font-size: 0.82rem;
          font-family: 'JetBrains Mono', monospace;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 1rem;
        }

        .loading-dots {
          display: flex;
          gap: 6px;
        }

        .loading-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #34d399;
          animation: bounce 1.2s ease-in-out infinite;
        }

        .loading-dot:nth-child(2) { animation-delay: 0.2s; background: #60a5fa; }
        .loading-dot:nth-child(3) { animation-delay: 0.4s; background: #a78bfa; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }

        .loading-text {
          font-size: 0.8rem;
          color: rgba(232,228,217,0.4);
          font-family: 'JetBrains Mono', monospace;
        }

        @media (max-width: 768px) {
          .main {
            grid-template-columns: 1fr;
            height: auto;
          }
          .left-panel { height: 60vh; }
          .right-panel { height: 80vh; }
        }
      `}</style>

      <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" async></script>

      <div className="app">
        <header className="header">
          <div className="header-icon">📐</div>
          <div className="header-text">
            <h1>칠판 → 텍스트 변환기</h1>
            <p>Blackboard OCR · LaTeX · AI-Powered</p>
          </div>
        </header>

        <main className="main">
          {/* LEFT: Upload */}
          <div className="left-panel">
            <div
              ref={dropRef}
              className="drop-zone"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                dropRef.current?.classList.add("drag-over");
              }}
              onDragLeave={() => dropRef.current?.classList.remove("drag-over")}
              onDrop={handleDrop}
            >
              {image ? (
                <img src={image} alt="업로드된 칠판" />
              ) : (
                <div className="drop-placeholder">
                  <div className="drop-icon">🖼️</div>
                  <div className="drop-label">칠판 사진을 업로드하세요</div>
                  <div className="drop-sub">drag & drop · 클릭하여 선택</div>
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />

            <button
              className="analyze-btn"
              onClick={analyze}
              disabled={!imageBase64 || loading}
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  분석 중...
                </>
              ) : (
                <>✨ AI로 텍스트 추출</>
              )}
            </button>
          </div>

          {/* RIGHT: Result */}
          <div className="right-panel">
            <div className="tabs">
              <button
                className={`tab ${activeTab === "rendered" ? "active" : ""}`}
                onClick={() => setActiveTab("rendered")}
              >
                렌더링
              </button>
              <button
                className={`tab ${activeTab === "latex" ? "active" : ""}`}
                onClick={() => setActiveTab("latex")}
              >
                LaTeX 소스
              </button>
            </div>

            {summary && (
              <div className="summary-bar">
                <span className="summary-label">요약</span>
                <span>{summary}</span>
              </div>
            )}

            {result && (
              <div style={{ padding: "0.75rem 1.5rem 0", display: "flex" }}>
                <button className="copy-btn" onClick={copyLatex}>
                  {copied ? "✓ 복사됨" : "📋 LaTeX 복사"}
                </button>
              </div>
            )}

            <div className="result-area">
              {loading ? (
                <div className="loading-state">
                  <div className="loading-dots">
                    <div className="loading-dot" />
                    <div className="loading-dot" />
                    <div className="loading-dot" />
                  </div>
                  <div className="loading-text">칠판 내용 분석 중...</div>
                </div>
              ) : error ? (
                <div className="error-msg">{error}</div>
              ) : result ? (
                activeTab === "rendered" ? (
                  <div className="rendered-content">
                    {resultLines.map((line, i) => (
                      <div key={i} style={{ minHeight: line === "" ? "0.8em" : undefined }}>
                        {line === "" ? null : renderLatex(line)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="raw-content">{result}</div>
                )
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
    </>
  );
}
