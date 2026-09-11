import { describe, it, expect } from "vitest";
import { slugify, classSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Class 1 Section A")).toBe("class-1-section-a");
  });

  it("collapses consecutive non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("Math & Science!!")).toBe("math-science");
  });

  it("trims leading/trailing hyphens produced by leading/trailing punctuation", () => {
    expect(slugify("  -- Hello --  ")).toBe("hello");
  });

  it("trims surrounding whitespace before processing", () => {
    expect(slugify("  Primary  ")).toBe("primary");
  });

  it("returns an empty string for input that is entirely punctuation/whitespace", () => {
    expect(slugify("  !!!  ")).toBe("");
  });
});

describe("classSlug", () => {
  it("lowercases the division type and joins it with the level", () => {
    expect(classSlug("PRIMARY", 3)).toBe("primary-3");
    expect(classSlug("SECONDARY", 1)).toBe("secondary-1");
  });
});
