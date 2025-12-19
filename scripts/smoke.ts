const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}. Set it in .env first.`);
  return value;
};

Deno.env.set("DENO_DEPLOYMENT_ID", "local-smoke");
Deno.env.set("WARMUP_DB", "1");
requireEnv("DATABASE_URL");
requireEnv("COOKIE_SECRET");

// Force checkout dry-run without Stripe.
Deno.env.set("STRIPE_SECRET_KEY", "");
Deno.env.set("STRIPE_PUBLISHABLE_KEY", "");
Deno.env.set("STRIPE_WEBHOOK_SECRET", "");

await import("./db/init.ts");
await import("./db/seed_demo.ts");
await import("./warmup.ts");

const mod = await import("../src/main.tsx");
const handler = mod.default ?? { fetch: mod.fetch };
const fetchFn = handler?.fetch ?? mod.fetch;

assert(typeof fetchFn === "function", "No fetch handler exported.");

const cookieJar = new Map<string, string>();

const updateCookieJar = (headers: Headers) => {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return;
  const cookies = setCookie.split(/,(?=[^;]+=[^;]+)/g);
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (!value) {
      cookieJar.delete(name);
      continue;
    }
    cookieJar.set(name, value);
  }
};

const cookieHeader = () =>
  Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

const fetchWithCookies = async (url: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);
  const response = await fetchFn(new Request(url, { ...init, headers }));
  updateCookieJar(response.headers);
  return response;
};

const productsRes = await fetchWithCookies("http://local/products");
assert(productsRes.status === 200, `Expected 200, got ${productsRes.status}`);
const csrfToken = cookieJar.get("csrf_token");
assert(csrfToken, "Expected CSRF cookie on products page");

const addBody = new URLSearchParams({
  _csrf: csrfToken,
  productId: "carryall-tote",
  quantity: "1",
  returnTo: "/cart",
});
const addRes = await fetchWithCookies("http://local/cart/add", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: addBody.toString(),
});
assert(addRes.status === 303, `Expected 303, got ${addRes.status}`);

const cartRes = await fetchWithCookies("http://local/cart");
assert(cartRes.status === 200, `Expected 200, got ${cartRes.status}`);
const cartHtml = await cartRes.text();
assert(cartHtml.includes("Carryall Tote"), "Cart missing expected product");

const checkoutBody = new URLSearchParams({ _csrf: csrfToken });
const checkoutRes = await fetchWithCookies("http://local/checkout", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: checkoutBody.toString(),
});
assert(checkoutRes.status === 503, `Expected 503, got ${checkoutRes.status}`);
const checkoutText = await checkoutRes.text();
assert(
  checkoutText.includes("Stripe is not configured"),
  "Checkout dry-run did not hit expected guard",
);

console.log("OK smoke: seed + cart + checkout dry-run");
