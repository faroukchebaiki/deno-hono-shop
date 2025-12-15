import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import { serveStatic } from "hono/middleware";
import { authMiddleware } from "./middleware/auth.ts";

const startTime = Date.now();
const app = new Hono();

app.use("/static/*", serveStatic({ root: "./" }));

app.use(
  "*",
  jsxRenderer(({ children, title = "Hono Shop" }) => (
    <html data-theme="light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="stylesheet" href="/static/styles.css" />
      </head>
      <body class="min-h-screen bg-base-200 text-base-content">
        {children}
      </body>
    </html>
  )),
);

app.use("*", authMiddleware);

app.get("/", (c) =>
  c.render(
    <main class="flex min-h-screen items-center justify-center p-6">
      <div class="max-w-xl space-y-3 rounded-box bg-base-100 p-6 shadow-md">
        <p class="text-lg font-semibold">Hono SSR scaffold ready</p>
        <p class="text-sm opacity-80">
          Add your routes, pages, and business logic when you are ready to
          build out the shop.
        </p>
      </div>
    </main>,
    { title: "Hono Shop" },
  ),
);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString()
  }),
);

const port = Number(Deno.env.get("PORT") ?? "8000");

if (import.meta.main) {
  console.log(`Listening on http://localhost:${port}`);
  Deno.serve({ port }, app.fetch);
}

export default app;
