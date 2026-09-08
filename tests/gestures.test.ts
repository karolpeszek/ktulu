/**
 * Dotknięcie kontra przewinięcie na liście kart w przygotowaniu gry.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TAP_SLOP, isTap } from "../src/lib/gestures";

describe("Dotknięcie a przewinięcie", () => {
  it("palec postawiony i podniesiony w tym samym miejscu to dotknięcie", () => {
    assert.equal(isTap({ x: 120, y: 300 }, { x: 120, y: 300 }), true);
  });

  it("drgnięcie w granicach tolerancji nadal jest dotknięciem", () => {
    assert.equal(isTap({ x: 120, y: 300 }, { x: 123, y: 304 }), true, "5 px");
    assert.equal(isTap({ x: 0, y: 0 }, { x: 0, y: TAP_SLOP }), true, "dokładnie próg");
  });

  it("przesunięcie w pionie to przewijanie, nie wybór", () => {
    assert.equal(isTap({ x: 120, y: 300 }, { x: 120, y: 340 }), false);
    assert.equal(isTap({ x: 0, y: 0 }, { x: 0, y: TAP_SLOP + 1 }), false, "tuż za progiem");
  });

  it("przesunięcie w poziomie też nie jest dotknięciem", () => {
    assert.equal(isTap({ x: 120, y: 300 }, { x: 200, y: 300 }), false);
  });

  it("liczy się odległość, nie sama oś", () => {
    // 8 px w pionie i 8 px w poziomie to już ponad 11 px w linii prostej.
    assert.equal(isTap({ x: 0, y: 0 }, { x: 8, y: 8 }), false);
  });

  it("tolerancję da się zacieśnić", () => {
    assert.equal(isTap({ x: 0, y: 0 }, { x: 0, y: 6 }, 4), false);
  });
});
