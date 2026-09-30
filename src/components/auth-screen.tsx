"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Utensils, ArrowRight, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function AuthScreen({
  mode,
  onReady,
  onDemo,
  initialError = "",
}: {
  mode: "setup" | "signin" | "signup";
  onReady?: () => Promise<void>;
  onDemo?: () => void;
  initialError?: string;
}) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  const creating = mode !== "signin";
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="flex items-center gap-3 text-2xl font-semibold">
          <Utensils />
          messbook.
        </div>
        <div className="my-auto py-20">
          <p className="text-xs tracking-[.2em] text-emerald-200">
            EVERYONE AT THE TABLE
          </p>
          <h1 className="mt-6 max-w-lg text-5xl font-medium leading-tight">
            Shared meals.
            <br />
            Fair shares.
            <br />
            <span className="text-[#cbdda9]">Clear accounts.</span>
          </h1>
          <p className="mt-7 max-w-sm text-sm leading-7 text-emerald-100/70">
            View the mess freely. Create an account to join the team, then an
            administrator can approve you to record meals and expenses.
          </p>
        </div>
      </div>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="text-sm text-emerald-700">
            ← Back to home
          </Link>
          <h1 className="mt-8 text-3xl font-semibold">
            {mode === "setup"
              ? "Set up your mess"
              : mode === "signup"
                ? "Create your account"
                : "Welcome back"}
          </h1>
          <p className="mt-3 text-sm text-stone-500">
            {mode === "setup"
              ? "Create the initial administrator and open your workspace."
              : mode === "signup"
                ? "Start with view-only access. An admin can approve you to add meals."
                : "Sign in to your MessBook account."}
          </p>
          <form
            method="post"
            className="mt-7 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const data = Object.fromEntries(new FormData(e.currentTarget));
                if (mode === "signup") await authApi.signup(data);
                else await authApi.login(data);
                if (onReady) await onReady();
                else window.location.assign("/");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to continue");
              } finally {
                setBusy(false);
              }
            }}
          >
            {creating && (
              <>
                <label className="field">
                  Your name
                  <Input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                  />
                </label>
                <label className="field">
                  Qaum (optional)
                  <Input name="qaum" maxLength={100} />
                </label>
              </>
            )}
            {mode === "setup" && (
              <label className="field">
                Setup token
                <Input
                  name="setupToken"
                  type="password"
                  required
                  autoComplete="off"
                />
              </label>
            )}
            <label className="field">
              Email address
              <Input
                name="email"
                type="email"
                required
                maxLength={200}
                autoComplete="email"
              />
            </label>
            <label className="field">
              Password
              <Input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={creating ? "new-password" : "current-password"}
              />
              <small>At least 12 characters</small>
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <Button className="w-full" disabled={busy || !ready}>
              {busy ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <ArrowRight size={17} />
              )}{" "}
              {mode === "setup"
                ? "Create workspace"
                : mode === "signup"
                  ? "Sign up"
                  : "Sign in"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-stone-500">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <Link className="text-emerald-700" href="/signup">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link className="text-emerald-700" href="/signin">
                  Sign in
                </Link>
              </>
            )}
          </p>
          {onDemo && (
            <Button variant="outline" className="mt-5 w-full" onClick={onDemo}>
              Explore a demo workspace
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
