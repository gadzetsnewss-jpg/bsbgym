/**
 * Supabase database types (Phase 3).
 *
 * Hand-written to match `supabase/migrations/20260817000001_auth_org_foundation.sql`
 * and `20260817000002_auth_org_rpcs.sql`. These are kept in sync manually so
 * the client is fully typed without running `supabase gen types`.
 * If a Supabase project is available you can regenerate them with:
 *
 *   supabase gen types typescript --project-id <ref> --schema public
 *
 * and the application will continue to work unchanged.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserStatus = "active" | "invited" | "suspended" | "deactivated";
export type BranchStatus = "active" | "inactive";
export type OrganizationStatus = "active" | "trial" | "suspended" | "archived";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      business_types: {
        Row: { code: string; label: string; sort_order: number };
        Insert: { code: string; label: string; sort_order?: number };
        Update: Partial<{
          code: string;
          label: string;
          sort_order: number;
        }>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          legal_name: string | null;
          business_type: string | null;
          email: string | null;
          phone: string | null;
          website: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          tax_id: string | null;
          currency: string;
          timezone: string;
          date_format: string;
          logo_url: string | null;
          status: OrganizationStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          name: string;
          legal_name: string | null;
          business_type: string | null;
          email: string | null;
          phone: string | null;
          website: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          tax_id: string | null;
          currency: string;
          timezone: string;
          date_format: string;
          logo_url: string | null;
          status: OrganizationStatus;
          created_by: string | null;
        }>;
        Update: Partial<{
          id: string;
          name: string;
          legal_name: string | null;
          business_type: string | null;
          email: string | null;
          phone: string | null;
          website: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          tax_id: string | null;
          currency: string;
          timezone: string;
          date_format: string;
          logo_url: string | null;
          status: OrganizationStatus;
        }>;
        Relationships: [
          {
            foreignKeyName: "organizations_business_type_fkey";
            columns: ["business_type"];
            isOneToOne: false;
            referencedRelation: "business_types";
            referencedColumns: ["code"];
          },
        ];
      };
      branches: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          phone: string | null;
          email: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          timezone: string;
          status: BranchStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          name: string;
          code: string;
          phone: string | null;
          email: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          timezone: string;
          status: BranchStatus;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          name: string;
          code: string;
          phone: string | null;
          email: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          timezone: string;
          status: BranchStatus;
        }>;
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          description: string | null;
          is_system: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          description: string | null;
          is_system: boolean;
          is_active: boolean;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          description: string | null;
          is_system: boolean;
          is_active: boolean;
        }>;
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          id: string;
          organization_id: string;
          role_id: string;
          permission: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          role_id: string;
          permission: string;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          role_id: string;
          permission: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          preferences: Json;
        }>;
        Update: Partial<{
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          preferences: Json;
        }>;
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role_id: string;
          status: UserStatus;
          access_all_branches: boolean;
          invited_at: string | null;
          accepted_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          user_id: string;
          role_id: string;
          status: UserStatus;
          access_all_branches: boolean;
          invited_at: string | null;
          accepted_at: string | null;
          created_by: string | null;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          user_id: string;
          role_id: string;
          status: UserStatus;
          access_all_branches: boolean;
          invited_at: string | null;
          accepted_at: string | null;
          created_by: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      member_branches: {
        Row: {
          id: string;
          organization_id: string;
          member_id: string;
          branch_id: string;
          created_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          member_id: string;
          branch_id: string;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          member_id: string;
          branch_id: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "member_branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_branches_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_branches_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role_id: string;
          /** Not selectable by `anon`/`authenticated` (column-level REVOKE). */
          token_hash: string;
          status: InvitationStatus;
          access_all_branches: boolean;
          expires_at: string;
          accepted_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          email: string;
          role_id: string;
          token_hash: string;
          status: InvitationStatus;
          access_all_branches: boolean;
          expires_at: string;
          accepted_at: string | null;
          created_by: string | null;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          email: string;
          role_id: string;
          status: InvitationStatus;
          access_all_branches: boolean;
          expires_at: string;
          accepted_at: string | null;
          created_by: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitation_branches: {
        Row: {
          id: string;
          organization_id: string;
          invitation_id: string;
          branch_id: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          invitation_id: string;
          branch_id: string;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          invitation_id: string;
          branch_id: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "invitation_branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitation_branches_invitation_id_fkey";
            columns: ["invitation_id"];
            isOneToOne: false;
            referencedRelation: "invitations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitation_branches_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          actor_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          metadata: Json;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          actor_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          metadata: Json;
        }>;
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: {
        Args: { target_org: string };
        Returns: boolean;
      };
      is_org_admin: {
        Args: { target_org: string };
        Returns: boolean;
      };
      is_org_owner: {
        Args: { target_org: string };
        Returns: boolean;
      };
      create_organization: {
        Args: {
          p_name: string;
          p_legal_name?: string | null;
          p_business_type?: string | null;
          p_email?: string | null;
          p_phone?: string | null;
          p_website?: string | null;
          p_address_line1?: string | null;
          p_address_line2?: string | null;
          p_city?: string | null;
          p_state?: string | null;
          p_postal_code?: string | null;
          p_country?: string | null;
          p_tax_id?: string | null;
          p_currency?: string;
          p_timezone?: string;
          p_date_format?: string;
          p_logo_url?: string | null;
          p_branch_name?: string | null;
          p_branch_code?: string | null;
          p_branch_phone?: string | null;
          p_branch_email?: string | null;
          p_branch_address_line1?: string | null;
          p_branch_address_line2?: string | null;
          p_branch_city?: string | null;
          p_branch_state?: string | null;
          p_branch_postal_code?: string | null;
          p_branch_country?: string | null;
          p_branch_timezone?: string;
        };
        Returns: string;
      };
      create_invitation: {
        Args: {
          p_org_id: string;
          p_email: string;
          p_role_id: string;
          p_branch_ids?: string[] | null;
          p_all_branches?: boolean;
          p_expires_hours?: number;
        };
        Returns: Array<{ invitation_id: string; token: string }>;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: Json;
      };
      revoke_invitation: {
        Args: { p_invitation_id: string };
        Returns: void;
      };
      update_member_role: {
        Args: { p_member_id: string; p_role_id: string };
        Returns: void;
      };
      set_member_status: {
        Args: { p_member_id: string; p_status: UserStatus };
        Returns: void;
      };
      update_member_branch_access: {
        Args: {
          p_member_id: string;
          p_branch_ids?: string[] | null;
          p_all_branches?: boolean;
        };
        Returns: void;
      };
      create_role: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_slug: string;
          p_description?: string | null;
          p_permissions?: string[];
        };
        Returns: string;
      };
      update_role: {
        Args: {
          p_role_id: string;
          p_name: string;
          p_description?: string | null;
        };
        Returns: void;
      };
      set_role_permissions: {
        Args: {
          p_role_id: string;
          p_permissions?: string[];
        };
        Returns: void;
      };
      set_role_status: {
        Args: {
          p_role_id: string;
          p_active: boolean;
        };
        Returns: void;
      };
    };
    Enums: {
      user_status: UserStatus;
      branch_status: BranchStatus;
      organization_status: OrganizationStatus;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: Record<string, unknown>;
  };
}
