import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES } from "@/config/business";
import { classify } from "@/lib/domain/classify";

const base = { type: "", brand: "", category: "", description: "", nik: "1234", staffName: "Staff" };

test("XL packages without Type/Brand (article XXL…) are VAS XL", () => {
  const c = classify({ ...base, article: "XXLMYPRIODEAL5G+24", description: "MYPRIO DEAL 5G+ 24" }, DEFAULT_RULES);
  assert.equal(c.group, "VAS");
  assert.equal(c.vasProvider, "XL");
  const other = classify({ ...base, article: "ABC123" }, DEFAULT_RULES);
  assert.equal(other.group, "ACC");
  const brandXl = classify({ ...base, brand: "XL", type: "ACCESSORIES", article: "X1" }, DEFAULT_RULES);
  assert.equal(brandXl.vasProvider, "XL");
});
