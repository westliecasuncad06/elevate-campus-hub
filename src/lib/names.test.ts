import { describe, expect, it } from "vitest";
import { formatName } from "./names";

describe("formatName", () => {
  it("turns an all-caps surname into a normal one", () => {
    expect(formatName("JARDIN")).toBe("Jardin");
    expect(formatName("DELA CRUZ")).toBe("Dela Cruz");
    expect(formatName("DE LA CRUZ")).toBe("De La Cruz");
  });

  it("handles hyphens, apostrophes and suffixes", () => {
    expect(formatName("SANTOS-REYES")).toBe("Santos-Reyes");
    expect(formatName("O'BRIEN")).toBe("O'Brien");
    expect(formatName("HABBUGAR JR.")).toBe("Habbugar Jr.");
    expect(formatName("REYES III")).toBe("Reyes III");
  });

  it("fixes an all-caps first name too", () => {
    expect(formatName("JAMES")).toBe("James");
    expect(formatName("MARIA CRISTINA")).toBe("Maria Cristina");
  });

  it("leaves names that are already written normally exactly as typed", () => {
    expect(formatName("Jardin")).toBe("Jardin");
    expect(formatName("McDonald")).toBe("McDonald");
    expect(formatName("dela Cruz")).toBe("dela Cruz");
    expect(formatName("O'Brien")).toBe("O'Brien");
    expect(formatName("de la Cruz")).toBe("de la Cruz");
  });

  it("only fixes the shouted words of a mixed name", () => {
    expect(formatName("Maria CRISTINA")).toBe("Maria Cristina");
    expect(formatName("JM Carlo")).toBe("JM Carlo");
  });

  it("keeps a lone short all-caps word and middle initials", () => {
    expect(formatName("JM")).toBe("JM");
    expect(formatName("RJ")).toBe("RJ");
    expect(formatName("SANTOS A.")).toBe("Santos A.");
  });

  it("tidies spacing and copes with empty input", () => {
    expect(formatName("  JARDIN  ")).toBe("Jardin");
    expect(formatName("Juan   Carlos")).toBe("Juan Carlos");
    expect(formatName("")).toBe("");
    expect(formatName("   ")).toBe("");
  });

  it("works with accented letters", () => {
    expect(formatName("PEÑA")).toBe("Peña");
    expect(formatName("NUÑEZ")).toBe("Nuñez");
  });
});
