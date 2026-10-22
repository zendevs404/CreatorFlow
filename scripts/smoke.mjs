// HTTP smoke test for a running CreatorFlow server (no browser, no database writes).
// Usage: BASE_URL=http://localhost:3000 node scripts/smoke.mjs
const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const results = [];
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    results.push(`FAIL  ${name}: ${err instanceof Error ? err.message : err}`);
  }
}
const eq = (actual, expected, what) => {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};
const get = (path, init) => fetch(base + path, { redirect: "manual", ...init });

for (const path of ["/dashboard", "/studio", "/calendar", "/posts", "/analytics", "/settings"]) {
  await check(`signed-out ${path} redirects to /login`, async () => {
    const r = await get(path);
    eq(r.status, 307, "status");
    if (!(r.headers.get("location") ?? "").endsWith("/login")) throw new Error(`location ${r.headers.get("location")}`);
  });
}
await check("/login and /signup render", async () => {
  for (const [path, text] of [["/login", "Welcome back"], ["/signup", "Create your account"]]) {
    const r = await get(path);
    eq(r.status, 200, `${path} status`);
    if (!(await r.text()).includes(text)) throw new Error(`${path} missing "${text}"`);
  }
});
await check("/privacy and /data-deletion are public", async () => {
  eq((await get("/privacy")).status, 200, "/privacy");
  eq((await get("/data-deletion")).status, 200, "/data-deletion");
  eq((await get("/data-deletion?code=0123456789abcdef01234567")).status, 200, "/data-deletion?code");
});
await check("security headers are present", async () => {
  const h = (await get("/login")).headers;
  eq(h.get("x-content-type-options"), "nosniff", "x-content-type-options");
  eq(h.get("x-frame-options"), "DENY", "x-frame-options");
  if (!h.get("content-security-policy")?.includes("frame-ancestors 'none'")) throw new Error("CSP frame-ancestors missing");
  if (!h.get("strict-transport-security")) throw new Error("HSTS missing");
  if (h.get("x-powered-by")) throw new Error("x-powered-by should be removed");
});
await check("OAuth callback needs a session (no open access)", async () => {
  const r = await get("/api/threads/callback?code=x&state=y");
  eq(r.status, 307, "status");
  if (!(r.headers.get("location") ?? "").includes("/login")) throw new Error(`location ${r.headers.get("location")}`);
});
await check("email confirmation never redirects off-site", async () => {
  const r = await get("/auth/confirm?token_hash=x&type=email&next=//evil.example");
  const loc = r.headers.get("location") ?? "";
  if (loc.includes("evil.example")) throw new Error(`redirected to ${loc}`);
});
for (const path of ["/api/threads/deauthorize", "/api/threads/data-deletion"]) {
  await check(`${path} rejects unsigned and forged requests`, async () => {
    const empty = await get(path, { method: "POST", body: new FormData() });
    if (![400, 503].includes(empty.status)) throw new Error(`unsigned: got ${empty.status}`);
    const form = new FormData();
    form.set("signed_request", "forged.payload");
    const forged = await get(path, { method: "POST", body: form });
    if (![400, 503].includes(forged.status)) throw new Error(`forged: got ${forged.status}`);
    const wrongMethod = await get(path);
    eq(wrongMethod.status, 405, "GET status");
  });
}
await check("Inngest endpoint is reachable without a browser session", async () => {
  const r = await get("/api/inngest");
  if (![200, 401, 403].includes(r.status)) throw new Error(`got ${r.status}`);
});

console.log(results.join("\n"));
console.log(failed === 0 ? `\nAll ${results.length} smoke checks passed against ${base}` : `\n${failed} of ${results.length} smoke checks FAILED`);
process.exit(failed === 0 ? 0 : 1);
