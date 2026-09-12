import { describe, expect, it } from "vitest";
import { centsToEurosInput, eurosToCents } from "@/lib/validation/finance-schemas";

describe("eurosToCents", () => {
  it("reads the pt-PT convention the UI presents", () => {
    expect(eurosToCents("1.500,00")).toBe(150_000);
    expect(eurosToCents("1500,50")).toBe(150_050);
    expect(eurosToCents("1.234.567,89")).toBe(123_456_789);
  });

  it("reads a plain decimal without inflating it a hundredfold", () => {
    // The regression: "1500.00" used to lose its dot as a thousands
    // separator and record €150 000 for a €1 500 payment.
    expect(eurosToCents("1500.00")).toBe(150_000);
    expect(eurosToCents("1500.5")).toBe(150_050);
  });

  it("still treats a clean group of three as thousands", () => {
    expect(eurosToCents("1.500")).toBe(150_000);
    expect(eurosToCents("1.500.000")).toBe(150_000_000);
  });

  it("handles whole numbers, spaces and the euro sign", () => {
    expect(eurosToCents("1500")).toBe(150_000);
    expect(eurosToCents(" 1 500,00 € ")).toBe(150_000);
  });

  it("rejects what is not a number", () => {
    expect(eurosToCents("")).toBeNaN();
    expect(eurosToCents("abc")).toBeNaN();
    expect(eurosToCents(",")).toBeNaN();
  });
});

describe("centsToEurosInput / eurosToCents round trip", () => {
  it("composes — the whole point of the pair", () => {
    for (const cents of [0, 1, 99, 150_000, 150_050, 123_456_789]) {
      expect(eurosToCents(centsToEurosInput(cents))).toBe(cents);
    }
  });
});
