import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CalendarView, type CalendarPost } from "@/components/calendar-view";
import { PlatformBadge, PlatformIcon } from "@/components/platform-icon";
import { ToastProvider } from "@/components/ui/toast";
import { PLATFORMS } from "@/lib/platforms";

vi.mock("@/lib/posts/actions", () => ({ reschedulePost: vi.fn(), cancelSchedule: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

describe("platform icon", () => {
  it("is named after the platform and draws the Threads glyph", () => {
    const { container } = render(<PlatformIcon platform="threads" />);
    expect(screen.getByRole("img", { name: "Threads" })).toBeInTheDocument();
    expect(container.querySelector("path")?.getAttribute("d")).toBe(PLATFORMS.threads.path);
  });
  it("badge shows icon and name", () => {
    render(<PlatformBadge platform="threads" />);
    expect(screen.getByText("Threads")).toBeInTheDocument();
  });
});

describe("calendar shows which platform each post is for", () => {
  const posts: CalendarPost[] = [
    { id: "p1", content: "Launch day", status: "scheduled", scheduled_at: "2026-10-22T03:00:00Z", platform: "threads" },
    { id: "p2", content: "Behind the scenes", status: "published", scheduled_at: "2026-10-22T08:00:00Z", platform: "threads" },
  ];
  const days = Array.from({ length: 7 }, (_, i) => `2026-10-${19 + i}`);

  function setup() {
    return render(
      <ToastProvider>
        <CalendarView view="week" anchor="2026-10-22" days={days} today="2026-10-22" timezone="Asia/Jakarta" posts={posts} />
      </ToastProvider>,
    );
  }

  it("puts the Threads icon on every post chip", () => {
    setup();
    for (const text of [/Launch day/, /Behind the scenes/]) {
      const chip = screen.getByRole("button", { name: text });
      expect(within(chip).getByRole("img", { name: "Threads" })).toBeInTheDocument();
    }
  });

  it("names the platform in the post details dialog", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Launch day/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Threads")).toBeInTheDocument();
  });
});
