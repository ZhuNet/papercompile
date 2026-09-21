import { describe, expect, it } from "vitest";
import runtimeSource from "../ompRuntime.ts?raw";

describe("OMP abort integration", () => {
  it("uses OMP's native user-interrupt reason", () => {
    expect(runtimeSource).toContain('USER_INTERRUPT_LABEL');
    expect(runtimeSource).toContain('reason: USER_INTERRUPT_LABEL');
    expect(runtimeSource).not.toContain('reason: "Stopped by PaperCompile"');
  });
});
