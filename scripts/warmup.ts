const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const textIncludes = async (response: Response, needle: string) => {
  const text = await response.text();
  return text.includes(needle);
};

const run = async () => {
  // Simulate deploy-like execution (no port binding, SSR fetch handler only).
  Deno.env.set("DENO_DEPLOYMENT_ID", "local-warmup");

  const mod = await import("../src/main.tsx");
  const handler = mod.default ?? { fetch: mod.fetch };
  const fetchFn = handler?.fetch ?? mod.fetch;

  assert(typeof fetchFn === "function", "No fetch handler exported from src/main.tsx");

  const cases = [
    {
      name: "GET /health",
      request: new Request("http://local/health"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const json = await res.json() as { status?: string };
        assert(json.status === "ok", "Health payload missing status=ok");
      }
    },
    {
      name: "GET /",
      request: new Request("http://local/"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(
          await textIncludes(res, "<html"),
          "Home page did not render HTML"
        );
      }
    },
    {
      name: "GET /auth/login",
      request: new Request("http://local/auth/login"),
      verify: async (res: Response) => {
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(
          await textIncludes(res, "action=\"/auth/login\""),
          "Login page did not render expected form"
        );
      }
    },
    {
      name: "GET /account (redirect)",
      request: new Request("http://local/account"),
      verify: (res: Response) => {
        assert(res.status === 302, `Expected 302, got ${res.status}`);
        const location = res.headers.get("location") ?? "";
        assert(
          location.startsWith("/auth/login"),
          `Expected redirect to /auth/login, got ${location}`
        );
      }
    },
    {
      name: "GET /admin (forbidden)",
      request: new Request("http://local/admin"),
      verify: (res: Response) => {
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      }
    }
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
