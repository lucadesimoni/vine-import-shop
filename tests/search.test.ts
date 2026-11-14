import { describe, expect, it } from "vitest";
import { FOLD_FROM, FOLD_TO, searchTokens, typoPatterns } from "~/lib/search";

describe("search terms", () => {
  it("folds accents and apostrophes and splits words", () => {
    expect(searchTokens("Sant'Agata  Rosé")).toEqual(["santagata", "rose"]);
    expect(searchTokens("Pinot-Grigio, Alto Adige")).toEqual(["pinot", "grigio", "alto", "adige"]);
    expect(searchTokens("100%_like\\")).toEqual(["100", "like"]); // LIKE wildcards are not passed through
    expect(searchTokens("   ")).toEqual([]);
  });
  it("tolerates one typo in longer words", () => {
    const like = (pat: string, s: string) => new RegExp(`^${pat.replace(/%/g, ".*").replace(/_/g, ".")}$`).test(s);
    const any = (t: string, s: string) => typoPatterns(t).some((p) => like(p, s));
    expect(any("proseco", "prosecco doc")).toBe(true); // missing letter
    expect(any("barbaresko", "barbaresco")).toBe(true); // wrong letter
    expect(any("nebbbiolo", "nebbiolo")).toBe(true); // extra letter
    expect(any("proseco", "lambrusco")).toBe(false);
    expect(typoPatterns("olio")).toEqual(["%olio%"]); // short words: exact
  });
  it("database folding table matches the JavaScript folding", () => {
    // every accented character maps to the letter searchTokens produces
    const folded = [...FOLD_FROM].map((ch, i) => FOLD_TO[i] ?? "");
    [...FOLD_FROM].forEach((ch, i) => {
      if (/['’`´]/.test(ch)) expect(folded[i]).toBe("");
      else if (ch === "-") expect(folded[i]).toBe(" ");
      else expect(folded[i]).toBe(ch.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    });
  });
});
