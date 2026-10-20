import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPath, deviceFrom, filterAccess, localDate, summarizeAccess } from "@/lib/domain/access";
import type { AccessEntry } from "@/types/access";

const TZ = "Asia/Jakarta";
const e = (ts: string, nik: string, event: AccessEntry["event"], path = "", device = ""): AccessEntry => ({ ts, nik, name: "", role: "viewer", event, path, ip: "1.1.1.1", location: "", device });

test("deviceFrom: common phones and desktops", () => {
  assert.equal(deviceFrom("Mozilla/5.0 (Linux; Android 14; SM-A556E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"), "Android · Chrome");
  assert.equal(deviceFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "iPhone · Safari");
  assert.equal(deviceFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0"), "Windows · Edge");
  assert.equal(deviceFrom("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36"), "Android · Samsung Internet");
  assert.equal(deviceFrom(""), "");
});

test("cleanPath: keeps app pathnames, drops queries and junk", () => {
  assert.equal(cleanPath("/staff?m=2026-10"), "/staff");
  assert.equal(cleanPath("/checklist/spv"), "/checklist/spv");
  assert.equal(cleanPath("https://evil.example/x"), null);
  assert.equal(cleanPath("//evil.example"), null);
  assert.equal(cleanPath("/api/refresh"), null);
  assert.equal(cleanPath("/<script>"), null);
  assert.equal(cleanPath(undefined), null);
});

test("localDate uses the store time zone (WIB = UTC+7)", () => {
  assert.equal(localDate("2026-10-20T16:59:00.000Z", TZ), "2026-10-20");
  assert.equal(localDate("2026-10-20T17:01:00.000Z", TZ), "2026-10-21");
});

test("filterAccess by account, kind and local date range", () => {
  const all = [
    e("2026-10-19T02:00:00.000Z", "1", "login"),
    e("2026-10-19T02:01:00.000Z", "1", "view", "/home"),
    e("2026-10-20T17:30:00.000Z", "2", "view", "/sales"), // 21 Oct WIB
    e("2026-10-20T03:00:00.000Z", "2", "login_failed"),
  ];
  assert.equal(filterAccess(all, { nik: "1", timeZone: TZ }).length, 2);
  assert.equal(filterAccess(all, { kind: "view", timeZone: TZ }).length, 2);
  assert.equal(filterAccess(all, { kind: "login", timeZone: TZ }).length, 2);
  assert.deepEqual(filterAccess(all, { from: "2026-10-21", timeZone: TZ }).map((x) => x.path), ["/sales"]);
  assert.equal(filterAccess(all, { from: "2026-10-19", to: "2026-10-20", timeZone: TZ }).length, 3);
});

test("summarizeAccess: counts, last login/seen, inactive accounts listed last", () => {
  const all = [
    e("2026-10-19T02:00:00.000Z", "1", "login", "", "Android · Chrome"),
    e("2026-10-19T02:01:00.000Z", "1", "view", "/home", "Android · Chrome"),
    e("2026-10-20T02:01:00.000Z", "1", "view", "/staff", "iPhone · Safari"),
    e("2026-10-20T03:00:00.000Z", "1", "login_failed"),
    e("2026-10-20T04:00:00.000Z", "9", "login_failed"),
  ];
  const rows = summarizeAccess(all, [{ nik: "1", name: "Adi", role: "viewer" }, { nik: "2", name: "Flora", role: "viewer" }], TZ);
  assert.deepEqual(rows.map((r) => r.nik), ["1", "9", "2"]);
  const adi = rows[0];
  assert.equal(adi.name, "Adi");
  assert.equal(adi.logins, 1);
  assert.equal(adi.views, 2);
  assert.equal(adi.failed, 1);
  assert.equal(adi.days, 2);
  assert.equal(adi.lastLogin, "2026-10-19T02:00:00.000Z");
  assert.equal(adi.lastSeen, "2026-10-20T02:01:00.000Z");
  assert.equal(adi.lastDevice, "iPhone · Safari");
  assert.equal(rows[2].lastSeen, null); // Flora never opened the dashboard
  assert.equal(rows[1].failed, 1); // unknown NIK with failed logins still shows up
});

test("isAppPath: only menu pages and their sub-pages", async () => {
  const { isAppPath } = await import("@/lib/domain/access");
  const hrefs = ["/home", "/focus/lob", "/checklist/spv"];
  assert.equal(isAppPath("/home", hrefs), true);
  assert.equal(isAppPath("/checklist/spv", hrefs), true);
  assert.equal(isAppPath("/homepage", hrefs), false);
  assert.equal(isAppPath("/random/junk", hrefs), false);
});

test("groupByDay splits newest-first entries by WIB day", async () => {
  const { groupByDay } = await import("@/lib/domain/access");
  const g = groupByDay(
    [e("2026-10-20T18:00:00.000Z", "1", "view"), e("2026-10-20T16:00:00.000Z", "1", "view"), e("2026-10-20T01:00:00.000Z", "1", "login")],
    TZ,
  );
  assert.deepEqual(g.map((x) => [x.date, x.items.length]), [["2026-10-21", 1], ["2026-10-20", 2]]);
});
