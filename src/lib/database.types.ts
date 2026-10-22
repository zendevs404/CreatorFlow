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
  claimed_at: string | null;
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
  token_refreshed_at: string | null;
  needs_reauth: boolean;
  last_error: string | null;
  insights_enabled: boolean;
};

/** Columns only server code (service role) can read or write. */
export type ThreadsAccountSecretRow = ThreadsAccountRow & { access_token_ciphertext: string | null };

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

export type PostMediaRow = {
  id: string;
  post_id: string;
  user_id: string;
  storage_path: string;
  mime_type: "image/jpeg" | "image/png";
  size_bytes: number;
  width: number;
  height: number;
  position: number;
  created_at: string;
};

export type PostInsightsRow = {
  post_id: string;
  user_id: string;
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  shares: number | null;
  fetched_at: string;
};

export type AccountInsightsRow = {
  user_id: string;
  threads_account_id: string | null;
  followers_count: number | null;
  views_7d: number | null;
  likes_7d: number | null;
  replies_7d: number | null;
  reposts_7d: number | null;
  quotes_7d: number | null;
  range_start: string | null;
  range_end: string | null;
  fetched_at: string;
};

export type AiUsageRow = { id: string; user_id: string; action: "ideas" | "hooks" | "rewrite" | "variations"; created_at: string };

export type DataDeletionRow = { confirmation_code: string; threads_user_id: string; status: "completed" | "no_data"; requested_at: string };

export type Database = {
  public: {
    Tables: {
      posts: {
        Row: PostRow;
        Insert: Partial<Pick<PostRow, "content" | "status" | "scheduled_at" | "timezone">> & { user_id: string };
        /** Server-managed columns are listed too; column grants stop user sessions from writing them. */
        Update: Partial<Pick<PostRow, "content" | "status" | "scheduled_at" | "timezone" | "failure_reason" | "claimed_at" | "external_container_id" | "external_post_id" | "published_at" | "threads_account_id">>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: never;
        Update: Partial<Pick<ProfileRow, "display_name" | "timezone">>;
        Relationships: [];
      };
      threads_accounts: {
        Row: ThreadsAccountSecretRow;
        Insert: Partial<Omit<ThreadsAccountSecretRow, "id">> & { user_id: string; threads_user_id: string };
        Update: Partial<Omit<ThreadsAccountSecretRow, "id" | "user_id">>;
        Relationships: [];
      };
      post_insights: {
        Row: PostInsightsRow;
        Insert: Partial<PostInsightsRow> & Pick<PostInsightsRow, "post_id" | "user_id">;
        Update: Partial<Omit<PostInsightsRow, "post_id" | "user_id">>;
        Relationships: [];
      };
      account_insights: {
        Row: AccountInsightsRow;
        Insert: Partial<AccountInsightsRow> & Pick<AccountInsightsRow, "user_id">;
        Update: Partial<Omit<AccountInsightsRow, "user_id">>;
        Relationships: [];
      };
      ai_usage: {
        Row: AiUsageRow;
        Insert: Pick<AiUsageRow, "user_id" | "action">;
        Update: never;
        Relationships: [];
      };
      data_deletion_requests: {
        Row: DataDeletionRow;
        Insert: Partial<DataDeletionRow> & Pick<DataDeletionRow, "confirmation_code" | "threads_user_id" | "status">;
        Update: never;
        Relationships: [];
      };
      post_media: {
        Row: PostMediaRow;
        Insert: Omit<PostMediaRow, "id" | "created_at">;
        Update: Partial<Pick<PostMediaRow, "position">>;
        Relationships: [];
      };
      publishing_attempts: {
        Row: PublishingAttemptRow;
        Insert: Partial<Omit<PublishingAttemptRow, "id">> & Pick<PublishingAttemptRow, "post_id" | "user_id" | "attempt_number">;
        Update: Partial<Pick<PublishingAttemptRow, "outcome" | "error_code" | "error_message" | "finished_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_due_posts: { Args: { batch_size?: number }; Returns: { id: string; user_id: string }[] };
      requeue_stale_publishing: { Args: { stale_after?: string }; Returns: { id: string; user_id: string; claimed_at: string }[] };
    };
    Enums: { post_status: PostStatus };
    CompositeTypes: Record<string, never>;
  };
};
