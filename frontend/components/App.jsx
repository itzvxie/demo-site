"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Mail, Sparkles } from "lucide-react";
import DashboardWorkspace from "@/components/DashboardWorkspace";
import { GOALS, SUBJECTS } from "@/lib/subjects";
import {
  fetchSession,
  logout,
  requestEmailCode,
  updateProfile,
  verifyEmailCode,
  verifyGoogleToken,
} from "@/lib/auth";

const ONBOARDING_STEPS = ["name", "goal", "subject"];

export default function App() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [user, setUser] = useState({
    firstName: "",
    goal: null,
    subject: "chemistry",
  });

  // On load: pick up an existing session cookie (returning visitor), or the
  // result of an Apple Sign In redirect, which lands back here as a full
  // page navigation with `?newUser=1` / `?authError=apple` on the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const appleNewUser = params.get("newUser") === "1";
    const appleError = params.get("authError");
    if (appleNewUser || appleError) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (appleError) setAuthError(appleError);

    fetchSession()
      .then((data) => {
        if (data?.user) {
          setUser((prev) => ({ ...prev, firstName: data.user.firstName || "" }));
          setIsAuthenticated(true);
          setIsNewUser(appleNewUser);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  function handleAuthenticated({ user: sessionUser, isNewUser: newUserFlag }) {
    setUser((prev) => ({ ...prev, firstName: sessionUser.firstName || "" }));
    setIsAuthenticated(true);
    setIsNewUser(Boolean(newUserFlag));
    setAuthError(null);
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
    return <AuthScreen onAuthenticated={handleAuthenticated} authError={authError} />;
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
// Authentication view
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || "";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function loadScriptOnce(src, globalCheck) {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && globalCheck()) return resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function AuthScreen({ onAuthenticated, authError }) {
  const [emailStep, setEmailStep] = useState("idle"); // idle | sent
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  const googleButtonRef = useRef(null);

  useEffect(() => {
    if (authError === "apple") {
      setError("Apple sign-in didn't go through. Please try again.");
    }
  }, [authError]);

  // Real Google Identity Services button - Google renders its own official
  // logo and label, so there is no icon of ours to embed here.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    loadScriptOnce("https://accounts.google.com/gsi/client", () => window.google?.accounts?.id)
      .then(() => {
        if (cancelled || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            setIsSubmitting(true);
            setError(null);
            try {
              const data = await verifyGoogleToken(response.credential);
              onAuthenticated(data);
            } catch (err) {
              setError(err.message || "Google sign-in failed.");
            } finally {
              setIsSubmitting(false);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          shape: "pill",
          width: 320,
          logo_alignment: "left",
        });
      })
      .catch(() => setError("Couldn't load Google Sign-In. Check your connection and reload."));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!APPLE_CLIENT_ID) return;
    loadScriptOnce(
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
      () => window.AppleID?.auth,
    )
      .then(() => {
        window.AppleID.auth.init({
          clientId: APPLE_CLIENT_ID,
          scope: "name email",
          redirectURI: `${API_BASE_URL}/api/auth/apple/callback`,
          usePopup: false,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function handleAppleClick() {
    if (!APPLE_CLIENT_ID) {
      setError("Apple sign-in isn't configured on this deployment yet.");
      return;
    }
    window.AppleID?.auth?.signIn();
  }

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-6 py-16">
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
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
      >
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <Sparkles className="h-6 w-6 text-indigo-300" />
        </div>

        <h1 className="bg-gradient-to-b from-zinc-50 to-zinc-400 bg-clip-text font-display text-5xl font-extrabold tracking-tight text-transparent sm:text-6xl">
          Novalis AI
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Your entire study workflow, rebuilt around one conversation.
          Solve, memorize, quiz and revise&nbsp;&mdash; all in one premium
          workspace.
        </p>

        <div className="mt-10 flex w-full flex-col items-center gap-3">
          {GOOGLE_CLIENT_ID ? (
            <div ref={googleButtonRef} className="w-[320px] max-w-full overflow-hidden rounded-full" />
          ) : (
            <DisabledAuthButton label="Continue with Google" hint="Google sign-in isn't configured yet" />
          )}

          {APPLE_CLIENT_ID ? (
            <AppleButton onClick={handleAppleClick} />
          ) : (
            <DisabledAuthButton label="Continue with Apple" hint="Apple sign-in isn't configured yet" />
          )}

          <div className="my-1 flex w-full items-center gap-3 text-[11px] uppercase tracking-wide text-zinc-600">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

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

        <p className="mt-8 text-xs text-zinc-600">
          By continuing you agree to Novalis AI&rsquo;s Terms &amp; Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}

function DisabledAuthButton({ label, hint }) {
  return (
    <button
      type="button"
      disabled
      title={hint}
      className="flex w-[320px] max-w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-white/5 bg-white/[0.02] px-5 py-3.5 text-sm font-medium text-zinc-600"
    >
      {label}
    </button>
  );
}

function AppleButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[320px] max-w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
    >
      <AppleLogoIcon className="h-4 w-4" />
      Continue with Apple
    </button>
  );
}

function AppleLogoIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.416-2.09-3.614-2.324-4.386-2.376-2-.156-3.675 1.09-4.61 1.09zm3.632-3.325c.843-1.012 1.4-2.427 1.245-3.831-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
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
