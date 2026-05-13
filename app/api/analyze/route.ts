import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `당신은 칠판/화이트보드 사진을 분석하는 전문 AI입니다.
이미지에서 텍스트와 수식을 정확하게 추출하고 다음 형식으로 출력하세요:

규칙:
1. 일반 텍스트는 그대로 출력
2. 수학 공식/수식은 반드시 LaTeX로 변환 (인라인: $수식$, 블록: $$수식$$)
3. 줄바꿈과 단락 구조를 최대한 원본에 맞게 유지
4. 읽기 어려운 부분은 [불명확] 표시
5. 그리스 문자, 적분, 행렬, 분수 등 모두 LaTeX로 표현

LaTeX 출력 후, 마지막에 ---SUMMARY--- 구분자를 넣고 한 줄로 내용 요약을 추가하세요.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다." }, { status: 500 });
  }

  const { imageData, mediaType } = await req.json();
  if (!imageData || !mediaType) {
    return NextResponse.json({ error: "이미지 데이터가 없습니다." }, { status: 400 });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageData },
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
    const err = await response.json().catch(() => ({}));
    return NextResponse.json(
      { error: err?.error?.message || `HTTP ${response.status}` },
      { status: response.status }
    );
  }

  const data = await response.json();
  const fullText = data.content?.map((b: any) => b.text || "").join("") || "";
  return NextResponse.json({ text: fullText });
}
