/**
 * Supabase Auth onboarding — sign-up / sign-in with local fallback.
 */

import { getSupabase, isSupabaseConfigured } from './supabase'

export interface AuthOnboardingResult {
  ok: boolean
  mode: 'supabase' | 'local'
  userId: string | null
  email: string
  message: string
}

export async function registerOnboardingAccount(opts: {
  email: string
  password: string
  companyHint?: string
}): Promise<AuthOnboardingResult> {
  const email = String(opts.email || '').trim().toLowerCase()
  const password = String(opts.password || '')
  if (!email || !email.includes('@')) {
    return {
      ok: false,
      mode: 'local',
      userId: null,
      email,
      message: 'Zadejte platný e-mail',
    }
  }
  if (password.length < 6) {
    return {
      ok: false,
      mode: 'local',
      userId: null,
      email,
      message: 'Heslo musí mít alespoň 6 znaků',
    }
  }

  if (isSupabaseConfigured) {
    const sb = getSupabase()
    if (sb) {
      try {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              company_hint: opts.companyHint || '',
              product: 'eventflow',
            },
          },
        })
        if (!error) {
          // Enable session persistence for onboarded SaaS users
          return {
            ok: true,
            mode: 'supabase',
            userId: data.user?.id || null,
            email,
            message: 'Účet vytvořen přes Supabase Auth',
          }
        }
        // Existing user — try sign-in
        const signIn = await sb.auth.signInWithPassword({ email, password })
        if (!signIn.error) {
          return {
            ok: true,
            mode: 'supabase',
            userId: signIn.data.user?.id || null,
            email,
            message: 'Přihlášení přes Supabase Auth úspěšné',
          }
        }
        return {
          ok: false,
          mode: 'supabase',
          userId: null,
          email,
          message: error.message || signIn.error.message || 'Auth selhala',
        }
      } catch (e) {
        return {
          ok: false,
          mode: 'supabase',
          userId: null,
          email,
          message: e instanceof Error ? e.message : 'Supabase Auth nedostupná',
        }
      }
    }
  }

  await new Promise((r) => setTimeout(r, 500))
  return {
    ok: true,
    mode: 'local',
    userId: `local_${email.replace(/[^a-z0-9]/gi, '_')}`,
    email,
    message: 'Lokální účet připraven (Supabase není nakonfigurováno)',
  }
}
