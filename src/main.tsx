import { Hono } from "hono";
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import { jsxRenderer, serveStatic } from "hono/middleware";
import { loadConfig } from "./config/env.ts";
import { authMiddleware } from "./middleware/auth.ts";

const startTime = Date.now();
const app = new Hono();
const { server } = loadConfig();
type LayoutProps = {
  children?: Child;
  title?: string;
};

const Layout = ({ children, title = "Hono Shop" }: LayoutProps) => (
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
);

app.use("/static/*", serveStatic({ root: "./" }));

app.use(
  "*",
  jsxRenderer(Layout),
);

app.use("*", authMiddleware);

app.get("/", (c: Context) =>
  c.render(
    <main class="flex min-h-screen items-center justify-center p-6">
      <div class="max-w-xl space-y-3 rounded-box bg-base-100 p-6 shadow-md">
        <p class="text-lg font-semibold">Hono SSR scaffold ready</p>
        <p class="text-sm opacity-80">
          Add your routes, pages, and business logic when you are ready to
          build out the shop.
        </p>
      </div>
    </main>
  ),
);

app.get("/health", (c: Context) =>
  c.json({
    status: "ok",
    environment: server.environment,
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString()
  }),
);

const port = server.port;
const isDenoDeploy = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

if (import.meta.main) {
  if (isDenoDeploy) {
    console.log("Listening on platform-assigned port (Deno Deploy)");
    Deno.serve(app.fetch);
  } else {
    console.log(`Listening on http://localhost:${port}`);
    Deno.serve({ port }, app.fetch);
  }
}

export default app;
