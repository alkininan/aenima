import { describe, expect, it } from "vitest";

import { identity } from "@/lib/placeholder";

describe("identity", () => {
  it("returns the value it is given", () => {
    expect(identity(42)).toBe(42);
  });

  it("preserves object references", () => {
    const value = { workspaceId: "ws_1" };
    expect(identity(value)).toBe(value);
  });
});
