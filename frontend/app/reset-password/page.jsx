"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Sparkles } from "lucide-react";
import { resetPassword } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing its token. Please request a new one.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-6 py-16">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-indigo-500/40 via-fuchsia-500/20 to-transparent blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
      >
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 backdrop-blur">
          <Sparkles className="h-5 w-5 text-indigo-300" />
        </div>

        {success ? (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <h1 className="font-display text-2xl font-bold text-zinc-100">Password updated</h1>
            <p className="mt-2 text-sm text-zinc-500">You're signed in. Let's get back to studying.</p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400"
            >
              Continue to Novalis AI
            </button>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold text-zinc-100">Set a new password</h1>
            <p className="mt-2 text-sm text-zinc-500">Choose something you haven&rsquo;t used before.</p>

            <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-2">
              <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 focus-within:border-white/20">
                <Lock className="h-4 w-4 shrink-0 text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="shrink-0 text-zinc-500 hover:text-zinc-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 focus-within:border-white/20">
                <Lock className="h-4 w-4 shrink-0 text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !password || !confirmPassword}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset password
              </button>
            </form>

            {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
