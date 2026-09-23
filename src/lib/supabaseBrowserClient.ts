import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Client usado só para autenticação no navegador (login/logout/sessão).
// Todas as leituras/escritas de dados passam pelos endpoints /api/*.py,
// que usam a service key + RLS no servidor.
export const supabaseBrowser = createClient(url, anonKey);
