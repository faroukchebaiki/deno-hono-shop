const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const textIncludes = async (response: Response, needle: string) => {
  const text = await response.text();
  return text.includes(needle);
};

const extractCookie = (setCookie: string | null, name: string) => {
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
};

const run = async () => {
  // Simulate deploy-like execution (no port binding, SSR fetch handler only).
  Deno.env.set("DENO_DEPLOYMENT_ID", "local-warmup");

  const mod = await import("../src/main.tsx");
  const handler = mod.default ?? { fetch: mod.fetch };
  const fetchFn = handler?.fetch ?? mod.fetch;

  assert(
    typeof fetchFn === "function",
    "No fetch handler exported from src/main.tsx",
  );

  const cases = [
    {
      name: "GET /health",
      request: new Request("http://local/health"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const json = await res.json() as { status?: string };
        assert(json.status === "ok", "Health payload missing status=ok");
      },
    },
    {
      name: "GET /",
      request: new Request("http://local/"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(
          await textIncludes(res, "<html"),
          "Home page did not render HTML",
        );
      },
    },
    {
      name: "GET /products",
      request: new Request("http://local/products"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(
          await textIncludes(res, "Browse products"),
          "Products page did not render expected heading",
        );
      },
    },
    {
      name: "GET /products/:slug",
      request: new Request("http://local/products/carryall-tote"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(
          await textIncludes(res, "Carryall Tote"),
          "Product detail page did not render expected content",
        );
      },
    },
    {
      name: "GET /about",
      request: new Request("http://local/about"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(
          await textIncludes(res, "SSR-only"),
          "About page did not render expected content",
        );
      },
    },
    {
      name: "GET /auth/login",
      request: new Request("http://local/auth/login"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(
          await textIncludes(res, 'action="/auth/login"'),
          "Login page did not render expected form",
        );
      },
    },
    {
      name: "POST /auth/login does not echo credentials",
      request: new Request("http://local/auth/login"),
      verify: async () => {
        const pageRes = await fetchFn(new Request("http://local/auth/login"));
        assert(pageRes.status === 200, `Expected 200, got ${pageRes.status}`);

        const csrf = extractCookie(
          pageRes.headers.get("set-cookie"),
          "csrf_token",
        );
        assert(csrf, "Expected CSRF cookie to be set");

        const body = new URLSearchParams({
          _csrf: csrf,
          returnTo: "/",
          email: "admin@example.com",
          password: "demo1234",
        });

        const loginRes = await fetchFn(
          new Request("http://local/auth/login", {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              cookie: `csrf_token=${csrf}`,
            },
            body: body.toString(),
          }),
        );

        assert(
          [200, 302].includes(loginRes.status),
          `Expected 200 or 302, got ${loginRes.status}`,
        );

        if (loginRes.status === 200) {
          const html = await loginRes.text();
          assert(
            !html.includes("demo1234"),
            "Login response echoed the password.",
          );
          assert(
            !html.includes("admin@example.com"),
            "Login response echoed the email address.",
          );
        }
      },
    },
    {
      name: "GET /nope (notFound)",
      request: new Request("http://local/nope"),
      verify: async (res: Response) => {
        assert(res.status === 404, `Expected 404, got ${res.status}`);
        assert(
          await textIncludes(res, "Page not found"),
          "NotFound page did not render expected content",
        );
      },
    },
    {
      name: "GET /account (redirect)",
      request: new Request("http://local/account"),
      verify: (res: Response) => {
        assert(res.status === 302, `Expected 302, got ${res.status}`);
        const location = res.headers.get("location") ?? "";
        assert(
          location.startsWith("/auth/login"),
          `Expected redirect to /auth/login, got ${location}`,
        );
      },
    },
    {
      name: "GET /admin (forbidden)",
      request: new Request("http://local/admin"),
      verify: (res: Response) => {
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      },
    },
  ] as const;

  for (const testCase of cases) {
    const response = await fetchFn(testCase.request);
    await testCase.verify(response);
    console.log(`OK ${testCase.name}`);
  }

  if (Deno.env.get("WARMUP_DB") === "1") {
    const { getDb } = await import("../src/db/client.ts");
    const sql = await getDb();
    const rows = await sql<{ ok: number }>`select 1 as ok;`;
    assert(rows[0]?.ok === 1, "DB smoke query failed");
    console.log("OK DB select 1");
  }
};

await run();
