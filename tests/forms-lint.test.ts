import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * <Button> (components/ui) defaults to type="button" so it never submits by accident. Inside a <Form> that means a
 * button meant to submit must say type="submit" — otherwise clicking it does nothing. This test finds such buttons:
 * a <Button …> without `type=` and without `onClick` that sits between <Form …> and </Form>.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : []; });
}

describe("form buttons", () => {
  it("every <Button> inside a <Form> either submits explicitly or has its own onClick", () => {
    const problems: string[] = [];
    for (const f of files("app")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<Form\b[\s\S]*?<\/Form>/g)) {
        for (const b of m[0].matchAll(/<Button\b([^>]*)>/g)) {
          if (!/\btype=/.test(b[1]) && !/\bonClick=/.test(b[1]) && !/\bform=/.test(b[1])) {
            const line = src.slice(0, (m.index ?? 0) + (b.index ?? 0)).split("\n").length;
            problems.push(`${f}:${line} ${b[0].slice(0, 80)}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
