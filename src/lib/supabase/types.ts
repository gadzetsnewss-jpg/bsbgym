/**
 * Supabase database types (Phase 3).
 *
 * Hand-written to match `supabase/migrations/`. These are kept in sync
 * manually so the client is fully typed without running `supabase gen types`.
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
export type GymMemberStatus = "active" | "inactive" | "suspended";
export type GymMemberGender = "male" | "female" | "other" | "unspecified";

type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

/**
 * Compact table shape for the Phase 3.2 module tables. Relationship metadata is
 * intentionally empty until `supabase gen types` is run against the project;
 * Row/Insert/Update stay in sync with the migrations. `Generated` lists
 * database-generated columns (e.g. `generated always as`) which cannot be
 * written by the client.
 */
type ModuleTable<T, Generated extends keyof T = never> = {
  Row: T;
  Insert: Partial<Omit<T, Generated>>;
  Update: Partial<Omit<T, Generated>>;
  Relationships: GenericRelationship[];
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
          slug: string;
          gstin: string | null;
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
          slug?: string;
          gstin?: string | null;
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
          slug?: string;
          gstin?: string | null;
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
          gstin: string | null;
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
          gstin?: string | null;
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
          gstin?: string | null;
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
          full_name: string | null;
          email: string | null;
          phone: string | null;
          username: string | null;
          contact_number: string | null;
          avatar_url: string | null;
          status: UserStatus;
          org_id: string | null;
          branch_id: string | null;
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
          username: string | null;
          contact_number: string | null;
          avatar_url: string | null;
          status?: UserStatus;
          org_id?: string | null;
          branch_id?: string | null;
          preferences: Json;
        }>;
        Update: Partial<{
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          username: string | null;
          contact_number: string | null;
          avatar_url: string | null;
          status?: UserStatus;
          org_id?: string | null;
          branch_id?: string | null;
          preferences: Json;
        }>;
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
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
      organization_settings: {
        Row: {
          id: string;
          organization_id: string;
          setting_key: string;
          setting_value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          setting_key: string;
          setting_value: Json;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          setting_key: string;
          setting_value: Json;
        }>;
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_settings: {
        Row: {
          id: string;
          organization_id: string;
          branch_id: string;
          setting_key: string;
          setting_value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          branch_id: string;
          setting_key: string;
          setting_value: Json;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          branch_id: string;
          setting_key: string;
          setting_value: Json;
        }>;
        Relationships: [
          {
            foreignKeyName: "branch_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_settings_branch_org_fkey";
            columns: ["organization_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      organization_subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          plan_name: string;
          status: string;
          start_date: string | null;
          end_date: string | null;
          trial_start: string | null;
          trial_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          plan_name?: string;
          status?: string;
          start_date?: string | null;
          end_date?: string | null;
          trial_start?: string | null;
          trial_end?: string | null;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          plan_name: string;
          status: string;
          start_date: string | null;
          end_date: string | null;
          trial_start: string | null;
          trial_end: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      gym_members: {
        Row: {
          id: string;
          organization_id: string;
          branch_id: string;
          code: string;
          first_name: string;
          last_name: string;
          full_name: string | null;
          email: string | null;
          phone: string;
          gender: GymMemberGender | null;
          date_of_birth: string | null;
          photo_url: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          notes: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          assigned_trainer_id: string | null;
          status: GymMemberStatus;
          joined_at: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          organization_id: string;
          branch_id: string;
          code: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string;
          gender: GymMemberGender | null;
          date_of_birth: string | null;
          photo_url: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          notes: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          assigned_trainer_id: string | null;
          status: GymMemberStatus;
          joined_at: string;
          created_by: string | null;
        }>;
        Update: Partial<{
          id: string;
          organization_id: string;
          branch_id: string;
          code: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string;
          gender: GymMemberGender | null;
          date_of_birth: string | null;
          photo_url: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          notes: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          assigned_trainer_id: string | null;
          status: GymMemberStatus;
          joined_at: string;
          created_by: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "gym_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gym_members_branch_org_fkey";
            columns: ["organization_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      // -------------------------------------------------------------------
      // Phase 3.2 module tables - catalog / reference
      // -------------------------------------------------------------------
      trainers: ModuleTable<
        {
          id: string;
          organization_id: string;
          branch_id: string | null;
          code: string | null;
          first_name: string;
          last_name: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          specialization: string | null;
          bio: string | null;
          hourly_rate: number | null;
          status: string;
          joined_at: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        },
        "full_name"
      >;
      membership_plans: ModuleTable<{
        id: string;
        organization_id: string;
        name: string;
        code: string;
        description: string | null;
        duration_days: number;
        price: number;
        signup_fee: number;
        tax_rate: number;
        max_freeze_days: number;
        is_active: boolean;
        sort_order: number;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      gst_rates: ModuleTable<{
        id: string;
        organization_id: string;
        name: string;
        rate: number;
        hsn_sac: string | null;
        is_default: boolean;
        is_active: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      exercises: ModuleTable<{
        id: string;
        organization_id: string;
        name: string;
        category: string | null;
        muscle_group: string | null;
        equipment: string | null;
        difficulty: string | null;
        instructions: string | null;
        video_url: string | null;
        is_active: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      class_templates: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        name: string;
        description: string | null;
        duration_minutes: number;
        capacity: number;
        trainer_id: string | null;
        is_active: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      products: ModuleTable<{
        id: string;
        organization_id: string;
        name: string;
        sku: string | null;
        description: string | null;
        category: string | null;
        unit: string;
        cost_price: number;
        sale_price: number;
        tax_rate: number;
        track_stock: boolean;
        stock_quantity: number;
        reorder_level: number;
        is_active: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      suppliers: ModuleTable<{
        id: string;
        organization_id: string;
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        gstin: string | null;
        address_line1: string | null;
        address_line2: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
        country: string | null;
        notes: string | null;
        is_active: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      // -------------------------------------------------------------------
      // Phase 3.2 module tables - operations
      // -------------------------------------------------------------------
      memberships: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        member_id: string;
        plan_id: string;
        status: string;
        start_date: string;
        end_date: string;
        price: number;
        discount: number;
        final_amount: number;
        freeze_days_used: number;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      membership_freezes: ModuleTable<{
        id: string;
        organization_id: string;
        membership_id: string;
        start_date: string;
        end_date: string;
        days: number;
        reason: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      attendance_records: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        member_id: string;
        check_in_at: string;
        check_out_at: string | null;
        method: string;
        notes: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      trainer_assignments: ModuleTable<{
        id: string;
        organization_id: string;
        trainer_id: string;
        member_id: string;
        assigned_at: string;
        status: string;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      pt_sessions: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        trainer_id: string;
        member_id: string;
        scheduled_at: string;
        duration_minutes: number;
        status: string;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      class_sessions: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        class_template_id: string;
        trainer_id: string | null;
        starts_at: string;
        ends_at: string;
        capacity: number;
        status: string;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      class_bookings: ModuleTable<{
        id: string;
        organization_id: string;
        class_session_id: string;
        member_id: string;
        status: string;
        booked_at: string;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      workout_plans: ModuleTable<{
        id: string;
        organization_id: string;
        member_id: string;
        trainer_id: string | null;
        name: string;
        goal: string | null;
        start_date: string | null;
        end_date: string | null;
        notes: string | null;
        is_active: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      workout_plan_items: ModuleTable<{
        id: string;
        organization_id: string;
        plan_id: string;
        exercise_id: string | null;
        day_label: string | null;
        sets: number | null;
        reps: string | null;
        weight: string | null;
        rest_seconds: number | null;
        sort_order: number;
        notes: string | null;
        created_at: string;
      }>;
      diet_plans: ModuleTable<{
        id: string;
        organization_id: string;
        member_id: string;
        trainer_id: string | null;
        name: string;
        start_date: string | null;
        end_date: string | null;
        notes: string | null;
        is_active: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      diet_plan_items: ModuleTable<{
        id: string;
        organization_id: string;
        diet_plan_id: string;
        meal: string;
        description: string | null;
        calories: number | null;
        sort_order: number;
        created_at: string;
      }>;
      body_measurements: ModuleTable<{
        id: string;
        organization_id: string;
        member_id: string;
        measured_at: string;
        weight_kg: number | null;
        height_cm: number | null;
        body_fat_percent: number | null;
        chest_cm: number | null;
        waist_cm: number | null;
        hips_cm: number | null;
        arms_cm: number | null;
        thighs_cm: number | null;
        notes: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      progress_entries: ModuleTable<{
        id: string;
        organization_id: string;
        member_id: string;
        entry_date: string;
        weight_kg: number | null;
        photo_url: string | null;
        notes: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      // -------------------------------------------------------------------
      // Phase 3.2 module tables - commerce, finance, CRM, notifications
      // -------------------------------------------------------------------
      invoices: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        member_id: string | null;
        membership_id: string | null;
        invoice_number: string;
        status: string;
        issue_date: string;
        due_date: string | null;
        sub_total: number;
        discount: number;
        tax_total: number;
        cgst: number;
        sgst: number;
        igst: number;
        round_off: number;
        total: number;
        amount_paid: number;
        amount_credited: number;
        notes: string | null;
        place_of_supply: string | null;
        tax_mode: string;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      invoice_items: ModuleTable<{
        id: string;
        organization_id: string;
        invoice_id: string;
        description: string;
        item_type: string;
        quantity: number;
        unit_price: number;
        discount: number;
        tax_rate: number;
        taxable_amount: number;
        gst_amount: number;
        cgst: number;
        sgst: number;
        igst: number;
        line_total: number;
        sort_order: number;
        hsn_sac: string | null;
        plan_id: string | null;
        created_at: string;
      }>;
      payments: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        invoice_id: string | null;
        member_id: string | null;
        amount: number;
        method: string;
        reference: string | null;
        paid_at: string;
        notes: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      installments: ModuleTable<{
        id: string;
        organization_id: string;
        invoice_id: string;
        payment_id: string | null;
        due_date: string;
        amount: number;
        paid_amount: number;
        status: string;
        paid_at: string | null;
        sort_order: number;
        created_at: string;
      }>;
      credit_notes: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        invoice_id: string | null;
        member_id: string | null;
        credit_number: string;
        status: string;
        issue_date: string;
        amount: number;
        tax_total: number;
        reason: string | null;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      credit_note_items: ModuleTable<{
        id: string;
        organization_id: string;
        credit_note_id: string;
        description: string;
        quantity: number;
        unit_price: number;
        discount: number;
        tax_rate: number;
        taxable_amount: number;
        gst_amount: number;
        line_total: number;
        sort_order: number;
        created_at: string;
      }>;
      refunds: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        payment_id: string | null;
        invoice_id: string | null;
        member_id: string | null;
        amount: number;
        status: string;
        method: string;
        reason: string | null;
        notes: string | null;
        processed_at: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      pos_sales: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        member_id: string | null;
        sale_number: string;
        status: string;
        sub_total: number;
        discount: number;
        tax_total: number;
        total: number;
        payment_method: string;
        sold_at: string;
        notes: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      pos_sale_items: ModuleTable<{
        id: string;
        organization_id: string;
        sale_id: string;
        product_id: string | null;
        description: string;
        quantity: number;
        unit_price: number;
        tax_rate: number;
        line_total: number;
        created_at: string;
      }>;
      stock_movements: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        product_id: string;
        movement_type: string;
        quantity: number;
        reference_type: string | null;
        reference_id: string | null;
        notes: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      purchases: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        supplier_id: string | null;
        purchase_number: string;
        status: string;
        order_date: string;
        received_date: string | null;
        sub_total: number;
        tax_total: number;
        total: number;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      purchase_items: ModuleTable<{
        id: string;
        organization_id: string;
        purchase_id: string;
        product_id: string | null;
        description: string;
        quantity: number;
        unit_cost: number;
        line_total: number;
        created_at: string;
      }>;
      expenses: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        category: string;
        description: string | null;
        amount: number;
        expense_date: string;
        payment_method: string;
        status: string;
        reference: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      income_entries: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        category: string;
        description: string | null;
        amount: number;
        income_date: string;
        payment_method: string;
        reference: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      leads: ModuleTable<
        {
          id: string;
          organization_id: string;
          branch_id: string | null;
          first_name: string;
          last_name: string | null;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          source: string | null;
          status: string;
          interest: string | null;
          notes: string | null;
          assigned_to: string | null;
          converted_member_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        },
        "full_name"
      >;
      trial_memberships: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string;
        lead_id: string | null;
        member_id: string | null;
        starts_on: string;
        ends_on: string;
        status: string;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      follow_ups: ModuleTable<{
        id: string;
        organization_id: string;
        branch_id: string | null;
        lead_id: string | null;
        member_id: string | null;
        due_at: string;
        status: string;
        notes: string | null;
        assigned_to: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      referrals: ModuleTable<{
        id: string;
        organization_id: string;
        referrer_member_id: string;
        referred_name: string;
        referred_phone: string | null;
        referred_email: string | null;
        status: string;
        reward: string | null;
        notes: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      notifications: ModuleTable<{
        id: string;
        organization_id: string;
        recipient_id: string;
        title: string;
        body: string | null;
        type: string;
        link: string | null;
        is_read: boolean;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      current_user_org_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      username_is_available: {
        Args: { p_username: string };
        Returns: boolean;
      };
      auth_email_for_username: {
        Args: { p_username: string };
        Returns: string | null;
      };
      user_has_org_access: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      user_has_branch_access: {
        Args: { p_branch_id: string } | { p_org_id: string; p_branch_id: string };
        Returns: boolean;
      };
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
      save_onboarding_account: {
        Args: { p_first_name: string; p_last_name: string };
        Returns: void;
      };
      save_onboarding_business: {
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
        };
        Returns: string;
      };
      save_onboarding_branch: {
        Args: {
          p_name: string;
          p_code: string;
          p_phone?: string | null;
          p_email?: string | null;
          p_timezone?: string;
          p_address_line1?: string | null;
          p_address_line2?: string | null;
          p_city?: string | null;
          p_state?: string | null;
          p_postal_code?: string | null;
          p_country?: string | null;
        };
        Returns: string;
      };
      save_onboarding_preferences: {
        Args: { p_currency: string; p_timezone: string; p_date_format: string };
        Returns: string;
      };
      get_onboarding_organization: {
        Args: Record<PropertyKey, never>;
        Returns: Json | null;
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
      update_organization_preferences: {
        Args: {
          p_org_id: string;
          p_currency: string;
          p_timezone: string;
          p_date_format: string;
        };
        Returns: void;
      };
      update_organization: {
        Args: {
          p_org_id: string;
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
          p_gstin?: string | null;
          p_currency?: string | null;
          p_timezone?: string | null;
          p_date_format?: string | null;
          p_logo_url?: string | null;
        };
        Returns: void;
      };
      create_branch: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_code: string;
          p_phone?: string | null;
          p_email?: string | null;
          p_gstin?: string | null;
          p_address_line1?: string | null;
          p_address_line2?: string | null;
          p_city?: string | null;
          p_state?: string | null;
          p_postal_code?: string | null;
          p_country?: string | null;
          p_timezone?: string;
        };
        Returns: string;
      };
      update_branch: {
        Args: {
          p_branch_id: string;
          p_name: string;
          p_phone?: string | null;
          p_email?: string | null;
          p_gstin?: string | null;
          p_address_line1?: string | null;
          p_address_line2?: string | null;
          p_city?: string | null;
          p_state?: string | null;
          p_postal_code?: string | null;
          p_country?: string | null;
          p_timezone?: string | null;
        };
        Returns: void;
      };
      set_branch_status: {
        Args: { p_branch_id: string; p_status: BranchStatus };
        Returns: void;
      };
      upsert_organization_setting: {
        Args: {
          p_org_id: string;
          p_setting_key: string;
          p_setting_value: Json;
        };
        Returns: void;
      };
      user_has_permission: {
        Args: { p_org_id: string; p_permission: string };
        Returns: boolean;
      };
      create_gym_member: {
        Args: {
          p_org_id: string;
          p_branch_id: string;
          p_first_name: string;
          p_last_name: string;
          p_phone: string;
          p_email?: string | null;
          p_gender?: string | null;
          p_date_of_birth?: string | null;
          p_photo_url?: string | null;
          p_emergency_contact_name?: string | null;
          p_emergency_contact_phone?: string | null;
          p_notes?: string | null;
          p_address_line1?: string | null;
          p_address_line2?: string | null;
          p_city?: string | null;
          p_state?: string | null;
          p_postal_code?: string | null;
          p_country?: string | null;
          p_joined_at?: string | null;
          p_assigned_trainer_id?: string | null;
        };
        Returns: string;
      };
      update_gym_member: {
        Args: {
          p_member_id: string;
          p_branch_id: string;
          p_first_name: string;
          p_last_name: string;
          p_phone: string;
          p_email?: string | null;
          p_gender?: string | null;
          p_date_of_birth?: string | null;
          p_photo_url?: string | null;
          p_emergency_contact_name?: string | null;
          p_emergency_contact_phone?: string | null;
          p_notes?: string | null;
          p_address_line1?: string | null;
          p_address_line2?: string | null;
          p_city?: string | null;
          p_state?: string | null;
          p_postal_code?: string | null;
          p_country?: string | null;
          p_joined_at?: string | null;
          p_assigned_trainer_id?: string | null;
        };
        Returns: void;
      };
      set_gym_member_status: {
        Args: { p_member_id: string; p_status: GymMemberStatus };
        Returns: void;
      };
      create_trainer: {
        Args: {
          p_org_id: string;
          p_branch_id: string | null;
          p_first_name: string;
          p_last_name: string;
          p_code: string | null;
          p_email: string | null;
          p_phone: string | null;
          p_specialization: string | null;
          p_bio: string | null;
          p_hourly_rate: number | null;
          p_joined_at: string | null;
        };
        Returns: string;
      };
      update_trainer: {
        Args: {
          p_trainer_id: string;
          p_branch_id: string | null;
          p_first_name: string;
          p_last_name: string;
          p_code: string | null;
          p_email: string | null;
          p_phone: string | null;
          p_specialization: string | null;
          p_bio: string | null;
          p_hourly_rate: number | null;
          p_joined_at: string | null;
        };
        Returns: void;
      };
      set_trainer_status: {
        Args: { p_trainer_id: string; p_active: boolean };
        Returns: void;
      };
      create_membership_plan: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_code: string;
          p_description: string | null;
          p_duration_days: number;
          p_price: number;
          p_signup_fee: number;
          p_tax_rate: number;
          p_max_freeze_days: number;
          p_sort_order: number;
          p_is_active: boolean;
        };
        Returns: string;
      };
      update_membership_plan: {
        Args: {
          p_plan_id: string;
          p_name: string;
          p_code: string;
          p_description: string | null;
          p_duration_days: number;
          p_price: number;
          p_signup_fee: number;
          p_tax_rate: number;
          p_max_freeze_days: number;
          p_sort_order: number;
          p_is_active: boolean;
        };
        Returns: void;
      };
      set_membership_plan_status: {
        Args: { p_plan_id: string; p_active: boolean };
        Returns: void;
      };
      create_gst_rate: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_rate: number;
          p_hsn_sac: string | null;
          p_is_default: boolean;
          p_is_active: boolean;
        };
        Returns: string;
      };
      update_gst_rate: {
        Args: {
          p_rate_id: string;
          p_name: string;
          p_rate: number;
          p_hsn_sac: string | null;
          p_is_default: boolean;
          p_is_active: boolean;
        };
        Returns: void;
      };
      set_gst_rate_status: {
        Args: { p_rate_id: string; p_active: boolean };
        Returns: void;
      };
      create_exercise: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_category: string | null;
          p_muscle_group: string | null;
          p_equipment: string | null;
          p_difficulty: string | null;
          p_instructions: string | null;
          p_video_url: string | null;
          p_is_active: boolean;
        };
        Returns: string;
      };
      update_exercise: {
        Args: {
          p_exercise_id: string;
          p_name: string;
          p_category: string | null;
          p_muscle_group: string | null;
          p_equipment: string | null;
          p_difficulty: string | null;
          p_instructions: string | null;
          p_video_url: string | null;
          p_is_active: boolean;
        };
        Returns: void;
      };
      set_exercise_status: {
        Args: { p_exercise_id: string; p_active: boolean };
        Returns: void;
      };
      create_class_template: {
        Args: {
          p_org_id: string;
          p_branch_id: string;
          p_name: string;
          p_description: string | null;
          p_duration_minutes: number;
          p_capacity: number;
          p_trainer_id: string | null;
          p_is_active: boolean;
        };
        Returns: string;
      };
      update_class_template: {
        Args: {
          p_template_id: string;
          p_branch_id: string;
          p_name: string;
          p_description: string | null;
          p_duration_minutes: number;
          p_capacity: number;
          p_trainer_id: string | null;
          p_is_active: boolean;
        };
        Returns: void;
      };
      set_class_template_status: {
        Args: { p_template_id: string; p_active: boolean };
        Returns: void;
      };
      create_product: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_sku: string | null;
          p_description: string | null;
          p_category: string | null;
          p_unit: string | null;
          p_cost_price: number;
          p_sale_price: number;
          p_tax_rate: number;
          p_track_stock: boolean;
          p_stock_quantity: number;
          p_reorder_level: number;
          p_is_active: boolean;
        };
        Returns: string;
      };
      update_product: {
        Args: {
          p_product_id: string;
          p_name: string;
          p_sku: string | null;
          p_description: string | null;
          p_category: string | null;
          p_unit: string | null;
          p_cost_price: number;
          p_sale_price: number;
          p_tax_rate: number;
          p_track_stock: boolean;
          p_stock_quantity: number;
          p_reorder_level: number;
          p_is_active: boolean;
        };
        Returns: void;
      };
      set_product_status: {
        Args: { p_product_id: string; p_active: boolean };
        Returns: void;
      };
      create_supplier: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_contact_name: string | null;
          p_email: string | null;
          p_phone: string | null;
          p_gstin: string | null;
          p_address_line1: string | null;
          p_address_line2: string | null;
          p_city: string | null;
          p_state: string | null;
          p_postal_code: string | null;
          p_country: string | null;
          p_notes: string | null;
          p_is_active: boolean;
        };
        Returns: string;
      };
      update_supplier: {
        Args: {
          p_supplier_id: string;
          p_name: string;
          p_contact_name: string | null;
          p_email: string | null;
          p_phone: string | null;
          p_gstin: string | null;
          p_address_line1: string | null;
          p_address_line2: string | null;
          p_city: string | null;
          p_state: string | null;
          p_postal_code: string | null;
          p_country: string | null;
          p_notes: string | null;
          p_is_active: boolean;
        };
        Returns: void;
      };
      set_supplier_status: {
        Args: { p_supplier_id: string; p_active: boolean };
        Returns: void;
      };
      create_membership: {
        Args: {
          p_org_id: string;
          p_branch_id: string;
          p_member_id: string;
          p_plan_id: string;
          p_start_date: string | null;
          p_end_date: string | null;
          p_price: number | null;
          p_discount: number | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      update_membership: {
        Args: {
          p_membership_id: string;
          p_branch_id: string;
          p_plan_id: string;
          p_start_date: string;
          p_end_date: string;
          p_price: number;
          p_discount: number;
          p_notes: string | null;
        };
        Returns: void;
      };
      set_membership_status: {
        Args: { p_membership_id: string; p_status: string };
        Returns: void;
      };
      create_membership_freeze: {
        Args: {
          p_org_id: string;
          p_membership_id: string;
          p_start_date: string;
          p_end_date: string;
          p_reason: string | null;
        };
        Returns: string;
      };
      extend_membership: {
        Args: {
          p_membership_id: string;
          p_days: number;
          p_notes: string | null;
        };
        Returns: void;
      };
      renew_membership: {
        Args: {
          p_membership_id: string;
          p_plan_id: string | null;
          p_start_date: string | null;
          p_price: number | null;
          p_discount: number | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      create_attendance_record: {
        Args: {
          p_org_id: string;
          p_branch_id: string;
          p_member_id: string;
          p_check_in_at: string | null;
          p_method: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      update_attendance_record: {
        Args: {
          p_record_id: string;
          p_check_out_at: string | null;
          p_notes: string | null;
        };
        Returns: void;
      };
      create_trainer_assignment: {
        Args: {
          p_org_id: string;
          p_trainer_id: string;
          p_member_id: string;
          p_assigned_at: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      set_trainer_assignment_status: {
        Args: { p_assignment_id: string; p_active: boolean };
        Returns: void;
      };
      create_pt_session: {
        Args: {
          p_org_id: string;
          p_branch_id: string;
          p_trainer_id: string;
          p_member_id: string;
          p_scheduled_at: string;
          p_duration_minutes: number;
          p_notes: string | null;
        };
        Returns: string;
      };
      update_pt_session: {
        Args: {
          p_session_id: string;
          p_branch_id: string;
          p_trainer_id: string;
          p_member_id: string;
          p_scheduled_at: string;
          p_duration_minutes: number;
          p_notes: string | null;
        };
        Returns: void;
      };
      set_pt_session_status: {
        Args: { p_session_id: string; p_status: string };
        Returns: void;
      };
      create_class_booking: {
        Args: {
          p_org_id: string;
          p_branch_id: string;
          p_member_id: string;
          p_class_session_id: string | null;
          p_class_template_id: string | null;
          p_trainer_id: string | null;
          p_starts_at: string | null;
          p_ends_at: string | null;
          p_capacity: number | null;
          p_status: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      update_class_booking: {
        Args: {
          p_booking_id: string;
          p_status: string;
          p_notes: string | null;
        };
        Returns: void;
      };
      set_class_booking_status: {
        Args: { p_booking_id: string; p_status: string };
        Returns: void;
      };
      create_class_session: {
        Args: {
          p_org_id: string;
          p_branch_id: string;
          p_class_template_id: string;
          p_trainer_id: string | null;
          p_starts_at: string | null;
          p_ends_at: string | null;
          p_capacity: number | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      update_class_session: {
        Args: {
          p_session_id: string;
          p_branch_id: string;
          p_trainer_id: string | null;
          p_starts_at: string;
          p_ends_at: string;
          p_capacity: number;
          p_status: string;
          p_notes: string | null;
        };
        Returns: void;
      };
      set_class_session_status: {
        Args: { p_session_id: string; p_status: string };
        Returns: void;
      };
      create_workout_plan: {
        Args: {
          p_org_id: string;
          p_member_id: string;
          p_trainer_id: string | null;
          p_name: string;
          p_goal: string | null;
          p_start_date: string | null;
          p_end_date: string | null;
          p_notes: string | null;
          p_is_active: boolean;
        };
        Returns: string;
      };
      update_workout_plan: {
        Args: {
          p_plan_id: string;
          p_member_id: string;
          p_trainer_id: string | null;
          p_name: string;
          p_goal: string | null;
          p_start_date: string | null;
          p_end_date: string | null;
          p_notes: string | null;
          p_is_active: boolean;
        };
        Returns: void;
      };
      set_workout_plan_status: {
        Args: { p_plan_id: string; p_active: boolean };
        Returns: void;
      };
      create_diet_plan: {
        Args: {
          p_org_id: string;
          p_member_id: string;
          p_trainer_id: string | null;
          p_name: string;
          p_start_date: string | null;
          p_end_date: string | null;
          p_notes: string | null;
          p_is_active: boolean;
        };
        Returns: string;
      };
      update_diet_plan: {
        Args: {
          p_plan_id: string;
          p_member_id: string;
          p_trainer_id: string | null;
          p_name: string;
          p_start_date: string | null;
          p_end_date: string | null;
          p_notes: string | null;
          p_is_active: boolean;
        };
        Returns: void;
      };
      set_diet_plan_status: {
        Args: { p_plan_id: string; p_active: boolean };
        Returns: void;
      };
      create_body_measurement: {
        Args: {
          p_org_id: string;
          p_member_id: string;
          p_measured_at: string | null;
          p_weight_kg: number | null;
          p_height_cm: number | null;
          p_body_fat_percent: number | null;
          p_chest_cm: number | null;
          p_waist_cm: number | null;
          p_hips_cm: number | null;
          p_arms_cm: number | null;
          p_thighs_cm: number | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      update_body_measurement: {
        Args: {
          p_measurement_id: string;
          p_member_id: string;
          p_measured_at: string | null;
          p_weight_kg: number | null;
          p_height_cm: number | null;
          p_body_fat_percent: number | null;
          p_chest_cm: number | null;
          p_waist_cm: number | null;
          p_hips_cm: number | null;
          p_arms_cm: number | null;
          p_thighs_cm: number | null;
          p_notes: string | null;
        };
        Returns: void;
      };
      create_progress_entry: {
        Args: {
          p_org_id: string;
          p_member_id: string;
          p_entry_date: string | null;
          p_weight_kg: number | null;
          p_photo_url: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      update_progress_entry: {
        Args: {
          p_entry_id: string;
          p_member_id: string;
          p_entry_date: string | null;
          p_weight_kg: number | null;
          p_photo_url: string | null;
          p_notes: string | null;
        };
        Returns: void;
      };
      create_invoice: {
        Args: {
          p_org_id: string;
          p_branch_id: string;
          p_member_id: string;
          p_membership_id: string | null;
          p_issue_date: string | null;
          p_due_date: string | null;
          p_notes: string | null;
          p_place_of_supply: string | null;
          p_tax_mode: string | null;
          p_round_off: number | null;
          p_items: Json;
          p_issue: boolean;
        };
        Returns: string;
      };
      issue_invoice: {
        Args: { p_invoice_id: string };
        Returns: void;
      };
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string | null };
        Returns: void;
      };
      record_payment: {
        Args: {
          p_org_id: string;
          p_invoice_id: string;
          p_amount: number;
          p_method: string;
          p_reference: string | null;
          p_paid_at: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      record_payments: {
        Args: {
          p_org_id: string;
          p_invoice_id: string;
          p_payments: Json;
        };
        Returns: void;
      };
      create_installment_schedule: {
        Args: {
          p_invoice_id: string;
          p_count: number;
          p_start_date: string | null;
        };
        Returns: void;
      };
      create_credit_note: {
        Args: {
          p_org_id: string;
          p_invoice_id: string;
          p_reason: string;
          p_notes: string | null;
          p_items: Json;
          p_apply: boolean;
        };
        Returns: string;
      };
      apply_credit_note: {
        Args: { p_credit_note_id: string };
        Returns: void;
      };
      void_credit_note: {
        Args: { p_credit_note_id: string };
        Returns: void;
      };
      request_refund: {
        Args: {
          p_org_id: string;
          p_payment_id: string;
          p_amount: number;
          p_method: string;
          p_reason: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      set_refund_status: {
        Args: { p_refund_id: string; p_status: string };
        Returns: void;
      };
    };
    Enums: {
      user_status: UserStatus;
      branch_status: BranchStatus;
      organization_status: OrganizationStatus;
      invitation_status: InvitationStatus;
      gym_member_status: GymMemberStatus;
    };
    CompositeTypes: Record<string, unknown>;
  };
}
