"use client";

/**
 * Centralized authentication state (Phase 3).
 *
 * Restores the session exactly once on mount, subscribes to auth changes,
 * and exposes the current user plus the auth operations used by pages and the
 * shell (login, signup, logout, password reset). Organization-scoped state
 * lives in `OrgProvider` so it can be seeded from the server layout.
 */

import * as React from "react";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  getSessionUser,
  onAuthStateChange,
  signInWithPassword,
  signOutCurrentUser,
  signUpWithPassword,
  sendPasswordResetEmail,
  updateUserPassword,
  type SessionUser,
  type SignUpInput,
  type SignUpResult,
} from "@/lib/auth/session";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthResult {
  error: { message: string } | null;
}

interface AuthContextValue {
  /** "loading" while the persisted session is being restored. */
  status: AuthStatus;
  user: SessionUser | null;
  /** False when no Supabase project is configured (preview mode). */
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<{ data: SignUpResult | null; error: { message: string } | null }>;
  signOut: () => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  refreshUser: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("loading");
  const [user, setUser] = React.useState<SessionUser | null>(null);

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus("unauthenticated");
      return;
    }

    let active = true;

    void (async () => {
      const current = await getSessionUser();
      if (!active) return;
      setUser(current);
      setStatus(current ? "authenticated" : "unauthenticated");
    })();

    const unsubscribe = onAuthStateChange((event, userId) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      if (userId) {
        setStatus("authenticated");
        void getSessionUser().then((next) => {
          if (active) setUser(next);
        });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      configured: isSupabaseConfigured,
      signIn: async (email, password) => {
        const result = await signInWithPassword(email, password);
        return result.error ? { error: { message: result.error.message } } : { error: null };
      },
      signUp: async (input) => {
        const result = await signUpWithPassword(input);
        if (result.error) return { data: null, error: { message: result.error.message } };
        return { data: result.data, error: null };
      },
      signOut: async () => {
        const result = await signOutCurrentUser();
        return result.error ? { error: { message: result.error.message } } : { error: null };
      },
      sendPasswordReset: async (email) => {
        const result = await sendPasswordResetEmail(email);
        return result.error ? { error: { message: result.error.message } } : { error: null };
      },
      updatePassword: async (password) => {
        const result = await updateUserPassword(password);
        return result.error ? { error: { message: result.error.message } } : { error: null };
      },
      refreshUser: async () => {
        const current = await getSessionUser();
        setUser(current);
        setStatus(current ? "authenticated" : "unauthenticated");
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
