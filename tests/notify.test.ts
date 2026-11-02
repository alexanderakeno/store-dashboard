import { test } from "node:test";
import assert from "node:assert/strict";
import { loginMessage } from "../lib/domain/notifyText";

test("login notification text and filters", () => {
  const opt = { kinds: new Set(["login", "failed"]), store: "QF10", timeZone: "Asia/Jakarta" };
  const base = { ts: "2026-11-01T02:12:00.000Z", nik: "24003475", name: "Chelsy Arrahmat", role: "viewer", event: "login", path: "", ip: "1.2.3.4", location: "Jakarta, ID", device: "iPhone · Safari" } as const;
  const m = loginMessage({ ...base }, opt)!;
  assert.match(m, /Login dashboard QF10/);
  assert.match(m, /Chelsy Arrahmat<\/b> \(24003475\)/);
  assert.match(m, /09:12 WIB/);
  assert.equal(loginMessage({ ...base, role: "admin" }, opt), null); // admin off by default
  assert.ok(loginMessage({ ...base, role: "admin" }, { ...opt, kinds: new Set(["admin"]) }));
  const f = { ...base, event: "login_failed" as const, name: "", role: "" as const };
  assert.match(loginMessage(f, opt, 1_000_000)!, /Login gagal QF10/);
  assert.equal(loginMessage(f, opt, 1_000_000 + 60_000), null); // quiet 10 min per NIK
  assert.ok(loginMessage(f, opt, 1_000_000 + 11 * 60_000));
  assert.equal(loginMessage({ ...base, name: "<b>x</b>" }, opt)!.includes("&lt;b&gt;x"), true); // escaped
});
