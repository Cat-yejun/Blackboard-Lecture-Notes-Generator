import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password + process.env.PASSWORD_SALT).digest("hex");
}

export async function POST(req: NextRequest) {
  const { action, username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해주세요." }, { status: 400 });
  }

  const passwordHash = hashPassword(password);

  if (action === "register") {
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (existing) {
      return NextResponse.json({ error: "이미 사용 중인 아이디예요." }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .insert({ username, password_hash: passwordHash })
      .select("id, username")
      .single();

    if (error) return NextResponse.json({ error: "회원가입 실패" }, { status: 500 });
    return NextResponse.json({ user: data });
  }

  if (action === "login") {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, username")
      .eq("username", username)
      .eq("password_hash", passwordHash)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "아이디 또는 비밀번호가 틀렸어요." }, { status: 401 });
    }

    return NextResponse.json({ user: data });
  }

  return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
}
