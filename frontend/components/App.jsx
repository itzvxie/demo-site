"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Mail, Sparkles } from "lucide-react";
import DashboardWorkspace from "@/components/DashboardWorkspace";
import { GOALS, SUBJECTS } from "@/lib/subjects";
import { fetchSession, logout, requestEmailCode, updateProfile, verifyEmailCode } from "@/lib/auth";

const ONBOARDING_STEPS = ["name", "goal", "subject"];

export default function App() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasEnteredAuth, setHasEnteredAuth] = useState(false);
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

  function handleAuthenticated({ user: sessionUser, isNewUser: newUserFlag }) {
    setUser((prev) => ({ ...prev, firstName: sessionUser.firstName || "" }));
    setIsAuthenticated(true);
    setIsNewUser(Boolean(newUserFlag));
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
          <LandingIntro key="landing" onContinue={() => setHasEnteredAuth(true)} />
        ) : (
          <AuthScreen key="auth" onAuthenticated={handleAuthenticated} />
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
        {isNewUser && <OnboardingCarousel onComplete={completeOnboarding} />}
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

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("signup"); // signup | login
  const [emailStep, setEmailStep] = useState("idle"); // idle | sent
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSendCode(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await requestEmailCode(email.trim());
      setEmailStep("sent");
      setCooldown(30);
    } catch (err) {
      setError(err.message || "Couldn't send that code. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();
    if (code.trim().length !== 6) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await verifyEmailCode(email.trim(), code.trim());
      onAuthenticated(data);
    } catch (err) {
      setError(err.message || "That code didn't work. Please try again.");
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
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <h1 className="font-display text-2xl font-bold text-zinc-100">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              {mode === "signup"
                ? "Start studying smarter in under a minute."
                : "Sign in to pick up where you left off."}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex w-full flex-col items-center gap-3">
          <AnimatePresence mode="wait">
            {emailStep === "idle" ? (
              <motion.form
                key="email-idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleSendCode}
                className="flex w-full flex-col gap-2"
              >
                <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 focus-within:border-white/20">
                  <Mail className="h-4 w-4 shrink-0 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.06] px-5 py-3.5 text-sm font-medium text-zinc-100 backdrop-blur transition-all hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send me a code
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="email-sent"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleVerifyCode}
                className="flex w-full flex-col gap-2"
              >
                <p className="text-xs text-zinc-500">
                  We sent a 6-digit code to <span className="text-zinc-300">{email}</span>
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-center text-lg tracking-[0.5em] text-zinc-100 placeholder:text-zinc-700 outline-none focus:border-indigo-400/60"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || code.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verify &amp; continue
                </button>
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailStep("idle");
                      setCode("");
                      setError(null);
                    }}
                    className="hover:text-zinc-300"
                  >
                    Use a different email
                  </button>
                  <button
                    type="button"
                    disabled={cooldown > 0}
                    onClick={handleSendCode}
                    className="hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "signup" ? "login" : "signup"));
            setEmailStep("idle");
            setCode("");
            setError(null);
          }}
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

function OnboardingCarousel({ onComplete }) {
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
    if (stepIndex === 0) return;
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
            disabled={stepIndex === 0}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors enabled:hover:bg-white/5 enabled:hover:text-zinc-200 disabled:opacity-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
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
