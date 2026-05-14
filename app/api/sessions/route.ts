import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET: 유저의 세션 목록 불러오기
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!userId) return NextResponse.json({ error: "userId 필요" }, { status: 400 });

  if (sessionId) {
    // 특정 세션의 섹션들 불러오기
    const { data, error } = await supabaseAdmin
      .from("sections")
      .select("*")
      .eq("session_id", sessionId)
      .order("order_index");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sections: data });
  }

  // 세션 목록 불러오기
  const { data, error } = await supabaseAdmin
    .from("note_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}

// POST: 현재 필기 저장
export async function POST(req: NextRequest) {
  const { userId, title, sections } = await req.json();

  if (!userId || !sections?.length) {
    return NextResponse.json({ error: "데이터 부족" }, { status: 400 });
  }

  // 세션 생성
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("note_sessions")
    .insert({ user_id: userId, title: title || `필기 ${new Date().toLocaleDateString("ko-KR")}` })
    .select("id")
    .single();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  // 섹션들 저장 (이미지는 base64 일부만 저장 - 용량 절약을 위해 썸네일만)
  const sectionRows = sections.map((s: any, i: number) => ({
    session_id: session.id,
    latex: s.latex,
    summary: s.summary || "",
    image_url: s.imageUrl || "",
    order_index: i,
  }));

  const { error: sectionsError } = await supabaseAdmin
    .from("sections")
    .insert(sectionRows);

  if (sectionsError) return NextResponse.json({ error: sectionsError.message }, { status: 500 });

  return NextResponse.json({ sessionId: session.id });
}

// DELETE: 세션 삭제
export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json();
  const { error } = await supabaseAdmin
    .from("note_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
