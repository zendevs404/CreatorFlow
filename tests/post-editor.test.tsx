import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PostEditor } from "@/components/post-editor";
import { ToastProvider } from "@/components/ui/toast";

const savePost = vi.fn();
vi.mock("@/lib/posts/actions", () => ({ savePost: (...a: unknown[]) => savePost(...a), deletePost: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

function setup(post = null as Parameters<typeof PostEditor>[0]["post"]) {
  return render(
    <ToastProvider>
      <PostEditor post={post} timezone="Asia/Jakarta" displayName="Ayu" />
    </ToastProvider>,
  );
}

describe("PostEditor", () => {
  it("updates the live counter and preview as you type", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Post text"), "Hello");
    expect(screen.getByText(/5 \/ 500/)).toBeInTheDocument();
    expect(screen.getAllByText("Hello").length).toBeGreaterThan(0);
  });

  it("blocks saving and scheduling when over the limit", async () => {
    setup({ id: "00000000-0000-4000-8000-000000000001", content: "a".repeat(501), status: "draft", scheduled_at: null, failure_reason: null });
    expect(screen.getByText(/501 \/ 500/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /schedule post/i })).toBeDisabled();
  });

  it("disables editing for published posts", () => {
    setup({ id: "00000000-0000-4000-8000-000000000002", content: "Live", status: "published", scheduled_at: "2026-10-01T00:00:00Z", failure_reason: null });
    expect(screen.getByLabelText("Post text")).toBeDisabled();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
  });

  it("sends a draft save to the server action", async () => {
    savePost.mockResolvedValue({ ok: true, message: "Draft saved.", data: { id: "00000000-0000-4000-8000-000000000003" } });
    setup();
    await userEvent.type(screen.getByLabelText("Post text"), "Idea");
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    expect(savePost).toHaveBeenCalledWith(expect.objectContaining({ content: "Idea", intent: "draft", timezone: "Asia/Jakarta" }));
  });
});
