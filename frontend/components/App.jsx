"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Apple, ArrowLeft, ArrowRight, Globe, Mail, Sparkles } from "lucide-react";
import DashboardWorkspace from "@/components/DashboardWorkspace";
import { GOALS, SUBJECTS } from "@/lib/subjects";

const ONBOARDING_STEPS = ["name", "goal", "subject"];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [user, setUser] = useState({
    firstName: "",
    goal: null,
    subject: "chemistry",
  });

  function handleSignIn() {
    setIsAuthenticated(true);
    setIsNewUser(true);
  }

  function completeOnboarding(profile) {
    setUser((prev) => ({ ...prev, ...profile }));
    setIsNewUser(false);
  }

  if (!isAuthenticated) {
    return <AuthScreen onSignIn={handleSignIn} />;
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
        <DashboardWorkspace user={user} setUser={setUser} />
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

function AuthScreen({ onSignIn }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-6">
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

        <div className="mt-10 flex w-full flex-col gap-3">
          <AuthButton icon={Globe} label="Continue with Google" onClick={onSignIn} />
          <AuthButton icon={Apple} label="Continue with Apple" onClick={onSignIn} />
          <AuthButton icon={Mail} label="Sign in with Email" onClick={onSignIn} subtle />
        </div>

        <p className="mt-8 text-xs text-zinc-600">
          By continuing you agree to Novalis AI&rsquo;s Terms &amp; Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}

function AuthButton({ icon: Icon, label, onClick, subtle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-medium transition-all duration-200 " +
        (subtle
          ? "border-white/10 bg-transparent text-zinc-300 hover:border-white/20 hover:bg-white/5"
          : "border-white/10 bg-white/[0.06] text-zinc-100 backdrop-blur hover:bg-white/[0.1] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_24px_-8px_rgba(99,102,241,0.5)]")
      }
    >
      <Icon className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-white" />
      {label}
    </button>
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
