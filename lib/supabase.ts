import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!;

// 클라이언트용 (브라우저)
export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// 서버용 (API route) - secret key 사용
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);
