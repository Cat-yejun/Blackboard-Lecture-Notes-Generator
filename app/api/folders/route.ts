import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId 필요" }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("folders").select("*").eq("user_id", userId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folders: data });
}

export async function POST(req: NextRequest) {
  const { userId, name } = await req.json();
  if (!userId || !name) return NextResponse.json({ error: "데이터 부족" }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("folders").insert({ user_id: userId, name }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folder: data });
}

export async function DELETE(req: NextRequest) {
  const { folderId } = await req.json();
  const { error } = await supabaseAdmin.from("folders").delete().eq("id", folderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { folderId, name } = await req.json();
  const { error } = await supabaseAdmin.from("folders").update({ name }).eq("id", folderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}