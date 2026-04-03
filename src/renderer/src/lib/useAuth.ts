import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

const ADMIN_EMAILS = ['dctunings@gmail.com']

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  isAdmin: boolean
}

export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, name: string) => Promise<string | null>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<string | null>
} {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? '')

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }

  const signUp = async (email: string, password: string, name: string): Promise<string | null> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name }, emailRedirectTo: 'https://app.dctuning.ie' }
    })
    return error?.message ?? null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email: string): Promise<string | null> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://app.dctuning.ie',
    })
    return error?.message ?? null
  }

  return { user, session, loading, isAdmin, signIn, signUp, signOut, resetPassword }
}
