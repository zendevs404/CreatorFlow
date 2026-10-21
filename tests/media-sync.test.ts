import { describe, expect, it } from "vitest";
import { planMediaSync } from "@/lib/posts/media-sync";
import type { MediaInput } from "@/lib/posts/schema";

const m = (name: string): MediaInput => ({ path: `u/${name}.png`, mime: "image/png", size: 1, width: 10, height: 10 });

describe("planMediaSync", () => {
  it("inserts new images with their positions", () => {
    const plan = planMediaSync([], [m("a"), m("b")]);
    expect(plan.insert.map((i) => [i.media.path, i.position])).toEqual([["u/a.png", 0], ["u/b.png", 1]]);
    expect(plan.reposition).toEqual([]);
    expect(plan.remove).toEqual([]);
  });
  it("keeps unchanged images untouched", () => {
    const plan = planMediaSync([{ storage_path: "u/a.png", position: 0 }], [m("a")]);
    expect(plan).toEqual({ insert: [], reposition: [], remove: [] });
  });
  it("removes dropped images and shifts the ones after them", () => {
    const plan = planMediaSync(
      [{ storage_path: "u/a.png", position: 0 }, { storage_path: "u/b.png", position: 1 }, { storage_path: "u/c.png", position: 2 }],
      [m("a"), m("c")],
    );
    expect(plan.remove).toEqual(["u/b.png"]);
    expect(plan.reposition).toEqual([{ path: "u/c.png", position: 1 }]);
    expect(plan.insert).toEqual([]);
  });
  it("handles add and remove together", () => {
    const plan = planMediaSync([{ storage_path: "u/a.png", position: 0 }], [m("b")]);
    expect(plan.insert).toHaveLength(1);
    expect(plan.remove).toEqual(["u/a.png"]);
  });
});
