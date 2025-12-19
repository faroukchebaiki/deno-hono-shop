import { Hono } from "hono";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { Child } from "hono/jsx";
import type { Role } from "../types/domain.ts";
import { ensureCsrfToken, validateCsrf } from "../auth/csrf.ts";
import { clearAuthCookie, issueAuthCookie } from "../middleware/auth.ts";
import { hashPassword, verifyPassword } from "../lib/crypto.ts";
import { collectErrors, parseEmail, parseString } from "../lib/validation.ts";
import { userRepository } from "../db/repositories.ts";

const auth = new Hono();
const demoEmails = new Set([
  "customer@example.com",
  "staff@example.com",
  "admin@example.com",
]);

const safeReturnTo = (value?: string) => {
  if (!value || typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
};

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

const renderLogin = (
  c: Context,
  opts?: { error?: string; returnTo?: string },
) => {
  const csrfToken = ensureCsrfToken(c);
  const returnTo = safeReturnTo(
    opts?.returnTo ?? c.req.query("returnTo") ?? "/",
  );
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
      <div class="mt-6 space-y-2">
        <p class="text-xs uppercase tracking-[0.18em] text-primary">
          Demo accounts
        </p>
        <div class="flex flex-wrap gap-2">
          {[
            { email: "customer@example.com", role: "Customer" },
            { email: "staff@example.com", role: "Staff" },
            { email: "admin@example.com", role: "Admin" },
          ].map((demo) => (
            <form
              method="POST"
              action="/auth/login"
              class="flex items-center gap-2"
              key={demo.email}
            >
              <input type="hidden" name="_csrf" value={csrfToken} />
              <input type="hidden" name="returnTo" value="/" />
              <input type="hidden" name="email" value={demo.email} />
              <input type="hidden" name="password" value="demo1234" />
              <button type="submit" class="btn btn-sm btn-outline">
                Login as {demo.role}
              </button>
            </form>
          ))}
        </div>
        <p class="text-xs text-base-content/60">
          Password for all demo users: <code class="font-mono">demo1234</code>
        </p>
      </div>
      <p class="mt-4 text-sm text-base-content/70">
        New here?{" "}
        <a class="link link-primary" href="/auth/register">Create an account</a>
      </p>
    </AuthCard>,
  );
};

const renderRegister = (c: Context, opts?: { error?: string }) => {
  const csrfToken = ensureCsrfToken(c);
  return c.render(
    <AuthCard title="Create account">
      {opts?.error && (
        <div class="alert alert-error mb-4 text-sm">{opts.error}</div>
      )}
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
        <button type="submit" class="btn btn-primary w-full">
          Create account
        </button>
      </form>
      <p class="mt-4 text-sm text-base-content/70">
        Already have an account?{" "}
        <a class="link link-primary" href="/auth/login">Sign in</a>
      </p>
    </AuthCard>,
  );
};

const setSessionCookie = async (
  c: Hono.Context,
  userId: string,
  role: Role,
) => {
  const cookie = await issueAuthCookie(userId, role);
  setCookie(c, cookie.name, cookie.value, cookie.attributes);
};

auth.get("/login", (c) => {
  return renderLogin(c);
});

auth.post("/login", async (c) => {
  const form = await parseForm(c);
  const csrfValid = validateCsrf(c, form._csrf);
  const returnTo = safeReturnTo(form.returnTo || "/");
  if (!csrfValid) {
    c.status(400);
    return renderLogin(c, {
      error: "Your session expired. Please try again.",
      returnTo,
    });
  }

  const email = form.email;
  const password = form.password;

  const validatedEmail = parseEmail(email);
  const validatedPassword = parseString(password, "Password", { minLength: 8 });
  const errors = collectErrors([validatedEmail, validatedPassword]);
  if (errors.length) {
    return renderLogin(c, { error: errors.join(" "), returnTo });
  }
  if (!validatedEmail.ok || !validatedPassword.ok) {
    return renderLogin(c, { error: "Invalid credentials.", returnTo });
  }

  try {
    const user = await userRepository.findByEmail(validatedEmail.value);
    if (!user || !user.passwordHash) {
      if (demoEmails.has(validatedEmail.value)) {
        return renderLogin(c, {
          error:
            "Demo users are not seeded yet. Run `deno task db:seed` with your current DATABASE_URL.",
          returnTo,
        });
      }
      return renderLogin(c, { error: "Invalid credentials.", returnTo });
    }

    const validPassword = await verifyPassword(
      validatedPassword.value,
      user.passwordHash,
    );
    if (!validPassword) {
      return renderLogin(c, { error: "Invalid credentials.", returnTo });
    }

    await setSessionCookie(c, user.id, user.role);
    return c.redirect(returnTo || "/");
  } catch (err) {
    console.error("Login error:", err);
    return renderLogin(c, {
      error: "Could not sign in. Check database connection and try again.",
      returnTo,
    });
  }
});

auth.get("/register", (c) => {
  return renderRegister(c);
});

auth.post("/register", async (c) => {
  const form = await parseForm(c);
  const csrfValid = validateCsrf(c, form._csrf);
  if (!csrfValid) {
    c.status(400);
    return renderRegister(c, { error: "Your session expired. Please retry." });
  }

  const email = form.email;
  const password = form.password;
  const name = form.name?.toString().trim() || undefined;

  const validatedEmail = parseEmail(email);
  const validatedPassword = parseString(password, "Password", { minLength: 8 });
  const errors = collectErrors([validatedEmail, validatedPassword]);
  if (errors.length) {
    return renderRegister(c, { error: errors.join(" ") });
  }
  if (!validatedEmail.ok || !validatedPassword.ok) {
    return renderRegister(c, { error: "Invalid input." });
  }

  try {
    const existing = await userRepository.findByEmail(validatedEmail.value);
    if (existing) {
      return renderRegister(c, {
        error: "An account with that email already exists.",
      });
    }

    const passwordHash = await hashPassword(validatedPassword.value);
    const user = await userRepository.create(
      validatedEmail.value,
      passwordHash,
      name,
    );
    await setSessionCookie(c, user.id, user.role);
    return c.redirect("/");
  } catch (err) {
    console.error("Register error:", err);
    return renderRegister(c, {
      error:
        "Could not create account. Check database connection and try again.",
    });
  }
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
