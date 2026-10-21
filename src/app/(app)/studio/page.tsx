import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PostEditor } from "@/components/post-editor";
import { requireUser } from "@/lib/supabase/session";
import { canSchedule, getConnectionState } from "@/lib/threads/accounts";

export const metadata: Metadata = { title: "Content Studio" };

export default async function StudioPage() {
  const { supabase, user, profile } = await requireUser();
  const threadsReady = canSchedule(await getConnectionState(supabase, user.id));
  return (
    <>
      <PageHeader
        title="Content Studio"
        description="Write a new post, add images, then save it as a draft or schedule it."
        actions={
          <Link href="/posts" className="text-sm text-accent hover:underline">
            Drafts are in Posts
          </Link>
        }
      />
      <PostEditor mode="create" post={null} timezone={profile.timezone} displayName={profile.display_name ?? "You"} userId={user.id} threadsReady={threadsReady} />
    </>
  );
}
