import { describe, expect, it } from "vitest";

import {
  componentFiles,
  isServerActionModule,
  repository,
  resolveImport,
  ungatedWrites,
} from "./writes";

/**
 * design-spec §17 C-25, the *grep* half (T0.48): "Every call into a mutation hook is
 * reached only from an element carrying `data-writes`". The browser half — that below the
 * read-only line no element carrying the attribute is in the DOM, and that 640 on pointer
 * and 768 on touch keep them — is TC2 in `e2e/frame.spec.ts`.
 */
describe("C-25 · every server action's call site sits inside a data-writes carrier", () => {
  const root = process.cwd();

  it("finds none outside a gate in the repository", () => {
    const repo = repository(root);
    expect(repo.files.length).toBeGreaterThan(0);
    expect(ungatedWrites(repo)).toEqual([]);
  });

  it("reads the gap moves as the writes on main, and nothing under the auth path", () => {
    const files = componentFiles(root);
    expect(files).toContain("src/app/i/[key]/GapMoves.tsx");
    expect(files.some((path) => path.startsWith("src/app/sign-in/"))).toBe(false);
    expect(isServerActionModule(repository(root).read("src/app/i/[key]/actions.ts"))).toBe(true);
    expect(isServerActionModule(repository(root).read("src/app/sign-in/actions.ts"))).toBe(true);
  });

  it("names a call site outside a gate and passes one inside, by the identifier itself", () => {
    const sources: Record<string, string> = {
      "src/app/x/actions.ts": `"use server";\nexport async function park(form: FormData) {}\nexport async function other() {}\n`,
      "src/app/x/Page.tsx": [
        'import { WriteGate } from "@/components/frame/WriteGate";',
        'import { park, other } from "./actions";',
        "export function Page() {",
        "  return (",
        "    <div>",
        "      <form action={park} />",
        "      <WriteGate><form action={park} /></WriteGate>",
        '      <div data-writes=""><button formAction={park} /></div>',
        "      <button onClick={() => void other()} />",
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
    };
    const found = ungatedWrites({
      files: ["src/app/x/Page.tsx"],
      read: (path) => sources[path] ?? "",
      exists: (path) => path in sources,
    });
    expect(found.map((use) => `${use.name}:${use.line}`)).toEqual(["park:6", "other:9"]);
  });

  it("resolves the alias and a relative path, with or without an extension", () => {
    const exists = (path: string) =>
      ["src/app/i/[key]/actions.ts", "src/lib/thing.tsx"].includes(path);
    expect(resolveImport("src/app/i/[key]/GapMoves.tsx", "./actions", exists)).toBe(
      "src/app/i/[key]/actions.ts",
    );
    expect(resolveImport("src/app/dev/item/page.tsx", "@/lib/thing", exists)).toBe(
      "src/lib/thing.tsx",
    );
    expect(resolveImport("src/app/x.tsx", "react", exists)).toBeNull();
    expect(resolveImport("src/app/x.tsx", "./missing", exists)).toBeNull();
  });

  it("reads the directive only at the top of a module", () => {
    expect(isServerActionModule('"use server";\nexport const a = 1;')).toBe(true);
    expect(isServerActionModule('// note\n"use server";\nexport const a = 1;')).toBe(true);
    expect(isServerActionModule('export const a = 1;\n"use server";')).toBe(false);
    expect(isServerActionModule('"use client";\nexport const a = 1;')).toBe(false);
  });
});
