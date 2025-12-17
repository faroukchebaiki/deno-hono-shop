import { Hono } from "hono";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { Child } from "hono/jsx";
import type { Role } from "../types/domain.ts";
import { ensureCsrfToken, validateCsrf } from "../auth/csrf.ts";
import { issueAuthCookie, clearAuthCookie } from "../middleware/auth.ts";
import { hashPassword, verifyPassword } from "../lib/crypto.ts";
import { userRepository } from "../db/repositories.ts";

const auth = new Hono();

const AuthCard = ({ title, children }: { title: string; children: Child }) => (
  <main class="flex min-h-screen items-center justify-center bg-base-200 px-4 py-10">
    <div class="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
      <div class="mb-6 space-y-1">
        <p class="text-xs uppercase tracking-[0.2em] text-primary">Account</p>
        <h1 class="text-2xl font-semibold">{title}</h1>
      </div>
      {children}
    </div>
  </main>
);

const parseForm = async (c: Context) => {
  const body = await c.req.parseBody() as Record<string, string>;
  return body;
};

const renderLogin = (c: Context, opts?: { error?: string; returnTo?: string }) => {
  const csrfToken = ensureCsrfToken(c);
  const returnTo = opts?.returnTo ?? c.req.query("returnTo") ?? "/";
  const error = opts?.error ?? c.req.query("error");

  return c.render(
    <AuthCard title="Sign in">
      {error && <div class="alert alert-error mb-4 text-sm">{error}</div>}
      <form method="POST" action="/auth/login" class="space-y-4">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label class="form-control w-full">
          <span class="label-text">Email</span>
          <input
            class="input input-bordered w-full"
            type="email"
            name="email"
            required
            autoComplete="email"
          />
        </label>
        <label class="form-control w-full">
          <span class="label-text">Password</span>
          <input
            class="input input-bordered w-full"
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="current-password"
          />
        </label>
        <button type="submit" class="btn btn-primary w-full">Sign in</button>
      </form>
      <p class="mt-4 text-sm text-base-content/70">
        New here? <a class="link link-primary" href="/auth/register">Create an account</a>
      </p>
    </AuthCard>
  );
};

const renderRegister = (c: Context, opts?: { error?: string }) => {
  const csrfToken = ensureCsrfToken(c);
  return c.render(
    <AuthCard title="Create account">
      {opts?.error && <div class="alert alert-error mb-4 text-sm">{opts.error}</div>}
      <form method="POST" action="/auth/register" class="space-y-4">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <label class="form-control w-full">
          <span class="label-text">Name</span>
          <input class="input input-bordered w-full" type="text" name="name" />
        </label>
        <label class="form-control w-full">
          <span class="label-text">Email</span>
          <input
            class="input input-bordered w-full"
            type="email"
            name="email"
            required
            autoComplete="email"
          />
        </label>
        <label class="form-control w-full">
          <span class="label-text">Password</span>
          <input
            class="input input-bordered w-full"
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" class="btn btn-primary w-full">Create account</button>
      </form>
      <p class="mt-4 text-sm text-base-content/70">
        Already have an account?{" "}
        <a class="link link-primary" href="/auth/login">Sign in</a>
      </p>
    </AuthCard>
  );
};

const validateCredentials = (email: string, password: string) => {
  const errors: string[] = [];
  if (!email || !email.includes("@")) errors.push("Please enter a valid email.");
  if (!password || password.length < 8) {
    errors.push("Password must be at least 8 characters.");
  }
  return errors;
};

const setSessionCookie = async (c: Hono.Context, userId: string, role: Role) => {
  const cookie = await issueAuthCookie(userId, role);
  setCookie(c, cookie.name, cookie.value, cookie.attributes);
};

auth.get("/login", (c) => {
  return renderLogin(c);
});

auth.post("/login", async (c) => {
  const form = await parseForm(c);
  const csrfValid = validateCsrf(c, form._csrf);
  if (!csrfValid) return c.text("Invalid CSRF token", 400);

  const email = (form.email ?? "").toString().trim().toLowerCase();
  const password = form.password ?? "";
  const returnTo = form.returnTo || "/";

  const errors = validateCredentials(email, password);
  if (errors.length) {
    return renderLogin(c, { error: errors.join(" "), returnTo });
  }

  const user = await userRepository.findByEmail(email);
  if (!user || !user.passwordHash) {
    return renderLogin(c, { error: "Invalid credentials.", returnTo });
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    return renderLogin(c, { error: "Invalid credentials.", returnTo });
  }

  await setSessionCookie(c, user.id, user.role);
  return c.redirect(returnTo || "/");
});

auth.get("/register", (c) => {
  return renderRegister(c);
});

auth.post("/register", async (c) => {
  const form = await parseForm(c);
  const csrfValid = validateCsrf(c, form._csrf);
  if (!csrfValid) return c.text("Invalid CSRF token", 400);

  const email = (form.email ?? "").toString().trim().toLowerCase();
  const password = form.password ?? "";
  const name = form.name?.toString().trim() || undefined;

  const errors = validateCredentials(email, password);
  if (errors.length) {
    return renderRegister(c, { error: errors.join(" ") });
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    return renderRegister(c, { error: "An account with that email already exists." });
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.create(email, passwordHash, name);
  await setSessionCookie(c, user.id, user.role);
  return c.redirect("/");
});

auth.post("/logout", async (c) => {
  const form = await parseForm(c);
  const csrfValid = validateCsrf(c, form._csrf);
  if (!csrfValid) return c.text("Invalid CSRF token", 400);

  const cookie = clearAuthCookie();
  setCookie(c, cookie.name, cookie.value, cookie.attributes);
  return c.redirect("/");
});

export const authRoutes = auth;
