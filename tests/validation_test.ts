import { assert, assertEquals } from "std/assert";
import {
  parseEmail,
  parseMoneyCents,
  parseOptionalInt,
  parsePositiveInt,
  parseString,
} from "../src/lib/validation.ts";

Deno.test("parseEmail normalizes and validates", () => {
  const result = parseEmail("  Test@Example.com  ");
  assert(result.ok);
  assertEquals(result.value, "test@example.com");

  const invalid = parseEmail("invalid");
  assert(!invalid.ok);
});

Deno.test("string and number validators handle limits", () => {
  const short = parseString("ok", "Name", { minLength: 3 });
  assert(!short.ok);

  const positive = parsePositiveInt("3.9", "Qty");
  assert(positive.ok);
  assertEquals(positive.value, 3);

  const optionalEmpty = parseOptionalInt("", "Stock");
  assert(optionalEmpty.ok);
  assertEquals(optionalEmpty.value, null);
});

Deno.test("parseMoneyCents converts dollars to cents", () => {
  const result = parseMoneyCents("12.34", "Price");
  assert(result.ok);
  assertEquals(result.value, 1234);
});
