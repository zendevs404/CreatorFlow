import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { decryptToken } from "@/lib/crypto/tokens";
import { PublishFailure, type PublishStore } from "@/lib/publishing/pipeline";

type Admin = SupabaseClient<Database>;

/** Supabase-backed store (service role). Every mutation is scoped by post id AND owner id AND expected status. */
export function createSupabasePublishStore(admin: Admin, encryptionKey: string, now: () => Date = () => new Date()): PublishStore {
  return {
    async loadPost(postId) {
      const { data: post, error } = await admin.from("posts").select("*").eq("id", postId).maybeSingle();
      if (error) throw new Error("Could not load the post.");
      if (!post) return null;
      const { data: media, error: mediaError } = await admin
        .from("post_media")
        .select("storage_path")
        .eq("post_id", post.id)
        .eq("user_id", post.user_id)
        .order("position", { ascending: true });
      if (mediaError) throw new Error("Could not load the post's images.");
      return {
        id: post.id,
        userId: post.user_id,
        status: post.status,
        content: post.content,
        externalContainerId: post.external_container_id,
        externalPostId: post.external_post_id,
        mediaPaths: media.map((m) => m.storage_path),
      };
    },

    async loadAccount(userId) {
      const { data, error } = await admin
        .from("threads_accounts")
        .select("*")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("Could not load the Threads connection.");
      if (!data || !data.access_token_ciphertext) return null;
      if (data.needs_reauth) throw new PublishFailure("unauthorized", "The Threads connection needs to be renewed. Reconnect your account in Settings.", false);
      if (data.token_expires_at && new Date(data.token_expires_at) <= now()) {
        throw new PublishFailure("unauthorized", "The Threads connection has expired. Reconnect your account in Settings.", false);
      }
      const token = decryptToken(data.access_token_ciphertext, encryptionKey, `${userId}:${data.threads_user_id}`);
      return { id: data.id, threadsUserId: data.threads_user_id, token };
    },

    async signMediaUrls(paths) {
      const { data, error } = await admin.storage.from("post-media").createSignedUrls(paths, 3600);
      if (error) throw new Error("Could not prepare the images.");
      const byPath = new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
      return paths.flatMap((p) => {
        const url = byPath.get(p);
        return url ? [url] : [];
      });
    },

    async saveContainer(post, containerId, accountId) {
      const { data, error } = await admin
        .from("posts")
        .update({ external_container_id: containerId, threads_account_id: accountId })
        .eq("id", post.id)
        .eq("user_id", post.userId)
        .eq("status", "publishing")
        .select("id");
      if (error) throw new Error("Could not save the Threads container id.");
      return data.length > 0;
    },

    async markPublished(post, externalPostId) {
      const { data, error } = await admin
        .from("posts")
        .update({ status: "published", published_at: now().toISOString(), failure_reason: null, ...(externalPostId ? { external_post_id: externalPostId } : {}) })
        .eq("id", post.id)
        .eq("user_id", post.userId)
        .eq("status", "publishing")
        .select("id");
      if (error) throw new Error("Could not record that the post was published.");
      return data.length > 0;
    },

    async markFailed(post, reason) {
      const { error } = await admin.from("posts").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", post.id).eq("user_id", post.userId).eq("status", "publishing");
      if (error) throw new Error("Could not record the failure.");
    },

    async deferPost(post, until, reason) {
      const { error } = await admin
        .from("posts")
        .update({ status: "scheduled", scheduled_at: until.toISOString(), failure_reason: reason, external_container_id: null, claimed_at: null })
        .eq("id", post.id)
        .eq("user_id", post.userId)
        .eq("status", "publishing");
      if (error) throw new Error("Could not reschedule the post.");
    },

    async flagAccountNeedsReauth(accountId, message) {
      await admin.from("threads_accounts").update({ needs_reauth: true, last_error: message }).eq("id", accountId);
    },

    async startAttempt(post) {
      const { data, error } = await admin.from("publishing_attempts").select("attempt_number").eq("post_id", post.id).order("attempt_number", { ascending: false }).limit(1);
      if (error) throw new Error("Could not start the publishing attempt.");
      const next = (data[0]?.attempt_number ?? 0) + 1;
      const { error: insertError } = await admin.from("publishing_attempts").insert({ post_id: post.id, user_id: post.userId, attempt_number: next, outcome: "started" });
      if (insertError) throw new Error("Could not start the publishing attempt.");
      return next;
    },

    async finishAttempt(post, outcome, code, message) {
      const { error } = await admin
        .from("publishing_attempts")
        .update({ outcome, error_code: code, error_message: message?.slice(0, 500) ?? null, finished_at: now().toISOString() })
        .eq("post_id", post.id)
        .eq("user_id", post.userId)
        .eq("outcome", "started");
      if (error) throw new Error("Could not finish the publishing attempt.");
    },
  };
}
