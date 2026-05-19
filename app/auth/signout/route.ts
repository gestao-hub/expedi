import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Explicitamente apaga cookies sb-*-auth-token mesmo que signOut() não tenha conseguido
  // por algum motivo (ex.: token já expirado no servidor). Garante 100% de logout local.
  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.startsWith('sb-') && (c.name.includes('auth') || c.name.includes('access') || c.name.includes('refresh'))) {
      store.delete(c.name);
    }
  }

  const url = new URL('/login', request.url);
  return NextResponse.redirect(url, { status: 303 });
}
