import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** the update policy of deploy/host/shopctl (bash): which versions an automatic nightly update may install */
function allowed(current: string, candidate: string, policy: string) {
  const script = `eval "$(sed -n '/^allowed() {/,/^}/p' deploy/host/shopctl)"; UPDATE_POLICY=${policy}; allowed ${current} ${candidate} && echo yes || echo no`;
  return execFileSync("bash", ["-c", script], { encoding: "utf8" }).trim() === "yes";
}

describe("shopctl automatic updates", () => {
  it("minor: features and fixes within the same major version", () => {
    expect(allowed("v1.12.0", "v1.13.0", "minor")).toBe(true);
    expect(allowed("v1.12.0", "v1.12.3", "minor")).toBe(true);
    expect(allowed("v1.12.0", "v2.0.0", "minor")).toBe(false); // never a new major
    expect(allowed("v1.12.0", "v1.12.0", "minor")).toBe(false); // nothing to do
    expect(allowed("v1.13.0", "v1.12.9", "minor")).toBe(false); // never downgrade
    expect(allowed("v1.9.0", "v1.10.0", "minor")).toBe(true); // numeric, not alphabetic
  });
  it("patch: fixes only", () => {
    expect(allowed("v1.12.0", "v1.12.1", "patch")).toBe(true);
    expect(allowed("v1.12.0", "v1.13.0", "patch")).toBe(false);
  });
  it("off: nothing", () => {
    expect(allowed("v1.12.0", "v1.12.1", "off")).toBe(false);
  });
});
