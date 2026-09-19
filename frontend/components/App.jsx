"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Sparkles } from "lucide-react";
import DashboardWorkspace from "@/components/DashboardWorkspace";
import { GOALS, SUBJECTS } from "@/lib/subjects";
import { fetchSession, forgotPassword, login, logout, signup, updateProfile } from "@/lib/auth";

const ONBOARDING_STEPS = ["name", "goal", "subject"];

export default function App() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Driving the landing/signup/login/forgot screens off a URL query param
  // (rather than plain component state) is what lets the browser's own
  // back/forward buttons move between them - Next's router manages the
  // history entries, so there's no fighting its own popstate handling.
  const screen = searchParams.get("screen");
  const hasEnteredAuth = Boolean(screen);

  const [checkingSession, setCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [user, setUser] = useState({
    firstName: "",
    goal: null,
    subject: "chemistry",
  });

  // On load: pick up an existing session cookie, so a returning visitor
  // skips straight past the landing/auth screens into the dashboard.
  useEffect(() => {
    fetchSession()
      .then((data) => {
        if (data?.user) {
          setUser((prev) => ({ ...prev, firstName: data.user.firstName || "" }));
          setIsAuthenticated(true);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  function enterAuth() {
    router.push("/?screen=signup", { scroll: false });
  }

  function handleAuthenticated({ user: sessionUser, isNewUser: newUserFlag }) {
    setUser((prev) => ({ ...prev, firstName: sessionUser.firstName || "" }));
    setIsAuthenticated(true);
    setIsNewUser(Boolean(newUserFlag));
    // Clear ?screen=... now that we're past it, so a later sign-out lands
    // cleanly back on the landing screen instead of re-showing login/signup.
    router.replace("/", { scroll: false });
  }

  async function completeOnboarding(profile) {
    setUser((prev) => ({ ...prev, ...profile }));
    setIsNewUser(false);
    try {
      await updateProfile(profile.firstName);
    } catch {
      // Non-fatal: the session still works, the name just won't survive a reload.
    }
  }

  async function handleSignOut() {
    try {
      await logout();
    } finally {
      setIsAuthenticated(false);
      setIsNewUser(false);
      setUser({ firstName: "", goal: null, subject: "chemistry" });
      router.replace("/?screen=login", { scroll: false });
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AnimatePresence mode="wait">
        {!hasEnteredAuth ? (
          <LandingIntro key="landing" onContinue={enterAuth} />
        ) : (
          <AuthScreen key="auth" screen={screen} onAuthenticated={handleAuthenticated} />
        )}
      </AnimatePresence>
    );
  }

  return (
    <div className="relative min-h-screen bg-zinc-950">
      <div
        className={
          isNewUser
            ? "pointer-events-none scale-[0.99] blur-sm brightness-75 transition-all duration-500"
            : "transition-all duration-500"
        }
      >
        <DashboardWorkspace user={user} setUser={setUser} onSignOut={handleSignOut} />
      </div>

      <AnimatePresence>
        {isNewUser && <OnboardingCarousel onComplete={completeOnboarding} onExit={handleSignOut} />}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing intro
// ---------------------------------------------------------------------------

const CAPABILITY_CHIPS = [
  { emoji: "🧮", label: "Solve", top: "22%", left: "10%" },
  { emoji: "🃏", label: "Flashcards", top: "28%", left: "82%" },
  { emoji: "🎧", label: "Podcast", top: "72%", left: "13%" },
  { emoji: "📅", label: "Study Plan", top: "76%", left: "84%" },
];

function LandingIntro({ onContinue }) {
  return (
    <motion.div
      exit={{ opacity: 0, scale: 1.04, filter: "blur(10px)" }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 px-6 text-center"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-indigo-500/40 via-fuchsia-500/20 to-transparent blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/3 top-2/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-3xl"
        animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        {CAPABILITY_CHIPS.map((chip, i) => (
          <motion.div
            key={chip.label}
            className="absolute flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur"
            style={{ top: chip.top, left: chip.left }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: [0, 1, 1, 0.6], y: [16, 0, 0, -12] }}
            transition={{ duration: 6, delay: 0.6 + i * 0.35, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
          >
            <span>{chip.emoji}</span>
            {chip.label}
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.5, rotate: -15 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 12, delay: 0.1 }}
        className="relative z-10 mb-8 flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5 backdrop-blur"
      >
        <Sparkles className="h-8 w-8 text-indigo-300" />
      </motion.div>

      <div className="relative z-10 overflow-hidden py-1">
        <motion.h1
          initial={{ y: "100%", opacity: 0, filter: "blur(12px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="bg-gradient-to-b from-zinc-50 to-zinc-400 bg-clip-text font-display text-6xl font-extrabold tracking-tight text-transparent sm:text-7xl"
        >
          Novalis AI
        </motion.h1>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="relative z-10 mt-5 max-w-md text-base text-zinc-400"
      >
        Solve, memorize, quiz and revise&nbsp;&mdash; your entire study workflow, rebuilt around one conversation.
      </motion.p>

      <motion.button
        type="button"
        onClick={onContinue}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.9 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="relative z-10 mt-10 flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-indigo-500/30"
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-white/20"
          animate={{ opacity: [0, 0.35, 0], scale: [1, 1.4, 1.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="relative">Start Learning</span>
        <ArrowRight className="relative h-5 w-5" />
      </motion.button>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3 }}
        className="relative z-10 mt-6 text-xs text-zinc-600"
      >
        Free to start &middot; No credit card required
      </motion.p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Authentication view - email only, with a sign up / log in toggle
// ---------------------------------------------------------------------------

const MIN_PASSWORD_LENGTH = 8;

function AuthScreen({ screen, onAuthenticated }) {
  const router = useRouter();
  // Driven by the ?screen= URL param (see App above) so the browser's own
  // back/forward buttons step between signup, login and forgot-password.
  const mode = screen === "login" || screen === "forgot" ? screen : "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Reset transient UI state whenever the mode changes - including via
  // browser back/forward, which lands here through the `screen` prop.
  useEffect(() => {
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setForgotSubmitted(false);
    setResendCooldown(0);
  }, [mode]);

  function switchMode(nextMode) {
    router.push(`/?screen=${nextMode}`, { scroll: false });
  }

  async function handleResend() {
    if (isResending || resendCooldown > 0) return;
    setError(null);
    setIsResending(true);
    try {
      await forgotPassword(email.trim());
      setResendCooldown(30);
    } catch (err) {
      setError(err.message || "Couldn't resend that email. Please try again.");
    } finally {
      setIsResending(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (mode === "forgot") {
      setIsSubmitting(true);
      try {
        await forgotPassword(email.trim());
        setForgotSubmitted(true);
        setResendCooldown(30);
      } catch (err) {
        setError(err.message || "Something went wrong. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data =
        mode === "signup" ? await signup(email.trim(), password) : await login(email.trim(), password);
      onAuthenticated(data);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-6 py-16"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-indigo-500/40 via-fuchsia-500/20 to-transparent blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/3 top-2/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-3xl"
        animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
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

        <AnimatePresence mode="wait">
          <motion.div
            key={mode === "forgot" && forgotSubmitted ? "forgot-sent" : mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <h1 className="font-display text-2xl font-bold text-zinc-100">
              {mode === "forgot"
                ? forgotSubmitted
                  ? "Check your email"
                  : "Reset your password"
                : mode === "signup"
                  ? "Create your account"
                  : "Welcome back"}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              {mode === "forgot"
                ? forgotSubmitted
                  ? "If an account exists for that email, a reset link is on its way. It expires in 30 minutes."
                  : "Enter your email and we'll send you a link to reset your password."
                : mode === "signup"
                  ? "Start studying smarter in under a minute."
                  : "Sign in to pick up where you left off."}
            </p>
          </motion.div>
        </AnimatePresence>

        {mode === "forgot" && forgotSubmitted ? (
          <div className="mt-8 flex w-full flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>

            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || resendCooldown > 0}
              className="flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isResending && <Loader2 className="h-3 w-3 animate-spin" />}
              {resendCooldown > 0
                ? `Didn't get it? Resend in ${resendCooldown}s`
                : "Didn't get it? Resend email"}
            </button>

            <button
              type="button"
              onClick={() => switchMode("login")}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-semibold text-zinc-100 transition-all hover:bg-white/10"
            >
              Back to log in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-2">
            <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 focus-within:border-white/20">
              <Mail className="h-4 w-4 shrink-0 text-zinc-500" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
              />
            </div>

            {mode !== "forgot" && (
              <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 focus-within:border-white/20">
                <Lock className="h-4 w-4 shrink-0 text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? `At least ${MIN_PASSWORD_LENGTH} characters` : "Password"}
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
            )}

            {mode === "login" && (
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="self-end text-xs text-zinc-500 hover:text-zinc-300"
              >
                Forgot password?
              </button>
            )}

            <AnimatePresence>
              {mode === "signup" && (
                <motion.div
                  key="confirm-password"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 focus-within:border-white/20">
                    <Lock className="h-4 w-4 shrink-0 text-zinc-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isSubmitting || !email.trim() || (mode !== "forgot" && !password)}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "forgot" ? "Send reset link" : mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}

        {mode === "forgot" ? (
          !forgotSubmitted && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="mt-6 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Back to <span className="font-medium text-indigo-300">log in</span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
            className="mt-6 text-xs text-zinc-500 hover:text-zinc-300"
          >
            {mode === "signup" ? (
              <>
                Already have an account? <span className="font-medium text-indigo-300">Log in</span>
              </>
            ) : (
              <>
                New here? <span className="font-medium text-indigo-300">Sign up</span>
              </>
            )}
          </button>
        )}

        <p className="mt-6 text-xs text-zinc-600">
          By continuing you agree to Novalis AI&rsquo;s Terms &amp; Privacy Policy.
        </p>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Conversational onboarding carousel
// ---------------------------------------------------------------------------

function OnboardingCarousel({ onComplete, onExit }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [profile, setProfile] = useState({ firstName: "", goal: null, subject: null });

  const step = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const canAdvance =
    (step === "name" && profile.firstName.trim().length > 0) ||
    (step === "goal" && Boolean(profile.goal)) ||
    (step === "subject" && Boolean(profile.subject));

  function goNext() {
    if (!canAdvance) return;
    if (isLastStep) {
      onComplete(profile);
      return;
    }
    setDirection(1);
    setStepIndex((i) => i + 1);
  }

  function goBack() {
    if (stepIndex === 0) {
      onExit?.();
      return;
    }
    setDirection(-1);
    setStepIndex((i) => i - 1);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-2xl sm:p-10"
      >
        <div className="mb-8 flex items-center justify-center gap-2">
          {ONBOARDING_STEPS.map((s, i) => (
            <div
              key={s}
              className={
                "h-1.5 rounded-full transition-all duration-300 " +
                (i === stepIndex
                  ? "w-8 bg-indigo-400"
                  : i < stepIndex
                    ? "w-4 bg-indigo-400/50"
                    : "w-4 bg-white/10")
              }
            />
          ))}
        </div>

        <div className="relative min-h-[280px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {step === "name" && (
                <NameStep
                  value={profile.firstName}
                  onChange={(firstName) => setProfile((p) => ({ ...p, firstName }))}
                  onSubmit={goNext}
                />
              )}
              {step === "goal" && (
                <GoalStep
                  value={profile.goal}
                  onSelect={(goal) => setProfile((p) => ({ ...p, goal }))}
                />
              )}
              {step === "subject" && (
                <SubjectStep
                  value={profile.subject}
                  onSelect={(subject) => setProfile((p) => ({ ...p, subject }))}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            {stepIndex === 0 ? "Sign out" : "Back"}
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance}
            className="flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all enabled:hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isLastStep ? "Finish Setup" : "Continue"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NameStep({ value, onChange, onSubmit }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-zinc-50">What should we call you? 👋</h2>
      <p className="mt-2 text-sm text-zinc-400">
        First name is perfect &mdash; we&rsquo;ll use it to keep things personal.
      </p>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder="e.g. Alex"
        className="mt-8 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-base text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-indigo-400/60 focus:bg-black/30"
      />
    </div>
  );
}

function GoalStep({ value, onSelect }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-zinc-50">What are we conquering today? 🚀</h2>
      <p className="mt-2 text-sm text-zinc-400">Pick whatever fits best right now.</p>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GOALS.map((goal) => (
          <SelectCard
            key={goal.id}
            emoji={goal.emoji}
            label={goal.label}
            selected={value === goal.id}
            onClick={() => onSelect(goal.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SubjectStep({ value, onSelect }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-zinc-50">
        Which subject usually gives you a headache? 🤯
      </h2>
      <p className="mt-2 text-sm text-zinc-400">
        We&rsquo;ll set this as your default study context.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SUBJECTS.map((subject) => (
          <SelectCard
            key={subject.id}
            emoji={subject.emoji}
            label={subject.label}
            selected={value === subject.id}
            onClick={() => onSelect(subject.id)}
            compact
          />
        ))}
      </div>
    </div>
  );
}

function SelectCard({ emoji, label, selected, onClick, compact }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-medium transition-all duration-200 " +
        (compact ? "flex-col items-center justify-center gap-1.5 py-4 text-center" : "") +
        " " +
        (selected
          ? "border-indigo-400/70 bg-indigo-500/15 text-white shadow-[0_0_0_1px_rgba(129,140,248,0.4)]"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.07]")
      }
    >
      <span className={compact ? "text-2xl" : "text-xl"}>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}
