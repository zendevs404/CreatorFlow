import type { PostStatus } from "@/lib/posts/status";

export type PostRow = {
  id: string;
  user_id: string;
  threads_account_id: string | null;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  timezone: string;
  external_container_id: string | null;
  external_post_id: string | null;
  published_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type ThreadsAccountRow = {
  id: string;
  user_id: string;
  threads_user_id: string;
  username: string | null;
  token_expires_at: string | null;
  connected_at: string;
  revoked_at: string | null;
};

export type PublishingAttemptRow = {
  id: string;
  post_id: string;
  user_id: string;
  attempt_number: number;
  outcome: "started" | "succeeded" | "failed";
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      posts: {
        Row: PostRow;
        Insert: Partial<Pick<PostRow, "content" | "status" | "scheduled_at" | "timezone">> & { user_id: string };
        Update: Partial<Pick<PostRow, "content" | "status" | "scheduled_at" | "timezone" | "failure_reason">>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: never;
        Update: Partial<Pick<ProfileRow, "display_name" | "timezone">>;
        Relationships: [];
      };
      threads_accounts: {
        Row: ThreadsAccountRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      publishing_attempts: {
        Row: PublishingAttemptRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { post_status: PostStatus };
    CompositeTypes: Record<string, never>;
  };
};
