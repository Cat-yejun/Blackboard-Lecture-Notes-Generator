import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!userId) return NextResponse.json({ error: "userId 필요" }, { status: 400 });

  if (sessionId) {
    const { data, error } = await supabaseAdmin
      .from("sections").select("*").eq("session_id", sessionId).order("order_index");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sections: data });
  }

  const { data, error } = await supabaseAdmin
    .from("note_sessions").select("*").eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}

export async function POST(req: NextRequest) {
  const { userId, title, folder, sections } = await req.json();
  if (!userId || !sections?.length) return NextResponse.json({ error: "데이터 부족" }, { status: 400 });

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("note_sessions")
    .insert({ user_id: userId, title: title || "제목 없음", folder: folder || "" })
    .select("id").single();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  const sectionRows = sections.map((s: any, i: number) => ({
    session_id: session.id, latex: s.latex, summary: s.summary || "",
    image_url: s.imageUrl || "", order_index: i,
  }));
  const { error: sectionsError } = await supabaseAdmin.from("sections").insert(sectionRows);
  if (sectionsError) return NextResponse.json({ error: sectionsError.message }, { status: 500 });
  return NextResponse.json({ sessionId: session.id });
}

export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json();
  const { error } = await supabaseAdmin.from("note_sessions").delete().eq("id", sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}