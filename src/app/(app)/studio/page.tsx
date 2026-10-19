import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PostEditor } from "@/components/post-editor";
import { requireUser } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Content Studio" };

export default async function StudioPage() {
  const { profile } = await requireUser();
  return (
    <>
      <PageHeader title="Content Studio" description="Write a post, save it as a draft, or schedule it." />
      <PostEditor post={null} timezone={profile.timezone} displayName={profile.display_name ?? "You"} />
    </>
  );
}
