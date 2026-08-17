/**
 * Supabase database types (Phase 1).
 *
 * These types describe the tables that Phase 1+ will create.
 * They are placeholders to satisfy the generic parameter of the Supabase
 * client and are NOT backed by any real schema yet.
 *
 * Do not treat the table names below as a final schema - Phase 1 defines the
 * actual migration. Keeping this type surface exists only to type the client
 * now, so swapping to generated types (`supabase gen types`) is trivial.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, { Row: Json; Insert: Json; Update: Json }>;
    Views: Record<string, { Row: Json }>;
    Functions: Record<string, unknown>;
    Enums: Record<string, string[]>;
    CompositeTypes: Record<string, unknown>;
  };
}
