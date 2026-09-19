"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calculator,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coffee,
  Download,
  FileText,
  FolderKanban,
  Headphones,
  LayoutDashboard,
  Loader2,
  Mic,
  Moon,
  Paperclip,
  Pause,
  PenTool,
  Play,
  Radar,
  Send,
  Settings,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { processStudyMaterial } from "@/lib/api";
import { SUBJECTS, getSubject } from "@/lib/subjects";

const NAV_ITEMS = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "vault", label: "Study Vault", icon: FolderKanban },
  { id: "recorder", label: "Live Lecture Recorder", icon: Mic },
  { id: "analytics", label: "Analytics Radar", icon: Radar },
  { id: "settings", label: "App Settings", icon: Settings },
];

const STUDY_MODULES = [
  {
    id: "solver",
    title: "Solver Arena",
    description:
      "Drop math tasks or chemical equations and get instant, step-by-step solutions with clean equation blocks.",
    icon: Calculator,
  },
  {
    id: "assessment",
    title: "Micro-Assessment Suite",
    description:
      "Spin up multiple-choice quizzes, True/False prompts, or Leitner-style active-recall flashcards.",
    icon: FileText,
  },
  {
    id: "exam",
    title: "Oral & Written Mock Exam",
    description:
      "A real classroom simulation: countdown timer, mock questions, instant grader metrics.",
    icon: Timer,
  },
  {
    id: "podcast",
    title: "AI Conversational Podcast",
    description:
      "Turn any article or upload into a two-host audio discussion, ready to listen to on the go.",
    icon: Headphones,
  },
  {
    id: "notes",
    title: "Turbo Notes & Documents",
    description:
      "Splits incoming PDFs into summaries, structured tables, and a study timeline.",
    icon: FolderKanban,
  },
  {
    id: "plan",
    title: "Study Plan Architect",
    description:
      "Assembles a complete milestone agenda around your specific test date.",
    icon: CalendarRange,
  },
];

function getGreeting(hour) {
  if (hour < 12) return { text: "Good morning", emoji: "☕", Icon: Coffee };
  if (hour < 18) return { text: "Good afternoon", emoji: "☀️", Icon: Sun };
  return { text: "Good evening", emoji: "🌙", Icon: Moon };
}

export default function DashboardWorkspace({ user, setUser }) {
  const [activeNav, setActiveNav] = useState("workspace");
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const [hour, setHour] = useState(() => new Date().getHours());

  const [promptText, setPromptText] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [studyPackage, setStudyPackage] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("summary");
  const [sketchOpen, setSketchOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeSubject = getSubject(user.subject);

  useEffect(() => {
    const interval = setInterval(() => setHour(new Date().getHours()), 60000);
    return () => clearInterval(interval);
  }, []);

  const greeting = getGreeting(hour);

  function selectSubject(id) {
    setUser((prev) => ({ ...prev, subject: id }));
    setSubjectMenuOpen(false);
  }

  function focusHub(seedText) {
    if (seedText && !promptText) setPromptText(seedText);
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleCardClick(moduleId) {
    if (moduleId === "exam") {
      if (!studyPackage?.quiz?.length) {
        setErrorMessage(
          "Generate a study package first (ask the AI something below) so there's a quiz to sit for.",
        );
        focusHub();
        return;
      }
      setExamOpen(true);
      return;
    }
    if (moduleId === "plan") {
      setPlanOpen(true);
      return;
    }
    const seeds = {
      solver: "Solve this step-by-step: ",
      assessment: `Create a quiz and flashcards on: `,
      podcast: `Turn this into a two-host podcast discussion: `,
      notes: `Summarize and structure this into notes: `,
    };
    focusHub(seeds[moduleId]);
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setAttachedFile({ name: file.name, mimeType: file.type, base64: null, unsupported: true });
      setErrorMessage(
        "Only PDF uploads are processed by the AI right now. Describe images/photos in the text box instead.",
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1];
      setAttachedFile({ name: file.name, mimeType: file.type, base64, unsupported: false });
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  }

  function toggleMic() {
    const SpeechRecognition =
      typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setErrorMessage("Voice dictation isn't supported in this browser yet.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      setPromptText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  async function handleAskAI() {
    const hasText = promptText.trim().length > 0;
    const hasDocument = attachedFile?.base64;

    if (!hasText && !hasDocument) {
      setErrorMessage("Type a question or attach a PDF before asking the AI.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const payload = hasDocument
        ? {
            documentBase64: attachedFile.base64,
            mimeType: attachedFile.mimeType,
            fileName: attachedFile.name,
            subject: activeSubject.label,
          }
        : { text: promptText.trim(), subject: activeSubject.label };

      const result = await processStudyMaterial(payload);
      setStudyPackage(result);
      setDrawerTab("summary");
      setDrawerOpen(true);
    } catch (error) {
      setErrorMessage(error.message || "Something went wrong. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-400">
      <Sidebar activeNav={activeNav} onSelect={setActiveNav} />

      <div className="flex-1 pl-20 sm:pl-24">
        <TopBar
          activeSubject={activeSubject}
          subjectMenuOpen={subjectMenuOpen}
          setSubjectMenuOpen={setSubjectMenuOpen}
          onSelectSubject={selectSubject}
          user={user}
        />

        <main className="relative mx-auto max-w-6xl px-6 pb-56 pt-16 sm:px-10">
          {activeNav === "workspace" ? (
            <>
              <Hero
                greeting={greeting}
                firstName={user.firstName}
                onGeneratePlan={() => setPlanOpen(true)}
              />
              <StudyGrid onCardClick={handleCardClick} />
            </>
          ) : (
            <ComingSoonPanel navId={activeNav} />
          )}
        </main>
      </div>

      {activeNav === "workspace" && (
        <FloatingInputHub
          activeSubject={activeSubject}
          promptText={promptText}
          setPromptText={setPromptText}
          attachedFile={attachedFile}
          onRemoveFile={() => setAttachedFile(null)}
          onFileChange={handleFileChange}
          fileInputRef={fileInputRef}
          textareaRef={textareaRef}
          isListening={isListening}
          onToggleMic={toggleMic}
          onOpenSketch={() => setSketchOpen(true)}
          isGenerating={isGenerating}
          onSubmit={handleAskAI}
          errorMessage={errorMessage}
        />
      )}

      <AnimatePresence>
        {drawerOpen && (
          <ResultsDrawer
            studyPackage={studyPackage}
            activeTab={drawerTab}
            setActiveTab={setDrawerTab}
            onClose={() => setDrawerOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{sketchOpen && <SketchModal onClose={() => setSketchOpen(false)} />}</AnimatePresence>

      <AnimatePresence>
        {examOpen && studyPackage?.quiz && (
          <ExamModal quiz={studyPackage.quiz} onClose={() => setExamOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {planOpen && (
          <StudyPlanModal
            subjectLabel={activeSubject.label}
            flashcards={studyPackage?.flashcards}
            onClose={() => setPlanOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ activeNav, onSelect }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-20 flex-col items-center gap-2 border-r border-white/5 bg-zinc-950/80 py-8 backdrop-blur sm:w-24">
      <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500">
        <Sparkles className="h-5 w-5 text-white" />
      </div>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeNav === item.id;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={() => onSelect(item.id)}
            className={
              "group relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl transition-all duration-200 " +
              (isActive
                ? "bg-white/10 text-zinc-50"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200")
            }
          >
            <Icon className="h-5 w-5" />
            {isActive && (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute -left-1 h-6 w-1 rounded-full bg-indigo-400"
              />
            )}
          </button>
        );
      })}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({ activeSubject, subjectMenuOpen, setSubjectMenuOpen, onSelectSubject, user }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-zinc-950/70 px-6 py-4 backdrop-blur sm:px-10">
      <div className="relative">
        <button
          type="button"
          onClick={() => setSubjectMenuOpen((open) => !open)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
        >
          <span className="text-base">{activeSubject.emoji}</span>
          {activeSubject.label}
          <ChevronDown
            className={"h-4 w-4 text-zinc-500 transition-transform " + (subjectMenuOpen ? "rotate-180" : "")}
          />
        </button>

        <AnimatePresence>
          {subjectMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-xl"
            >
              {SUBJECTS.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => onSelectSubject(subject.id)}
                  className={
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors " +
                    (subject.id === activeSubject.id
                      ? "bg-indigo-500/15 text-white"
                      : "text-zinc-300 hover:bg-white/5")
                  }
                >
                  <span className="text-base">{subject.emoji}</span>
                  {subject.label}
                  {subject.id === activeSubject.id && <Check className="ml-auto h-4 w-4 text-indigo-300" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 text-sm font-semibold text-white">
          {(user.firstName || "S").charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ greeting, firstName, onGeneratePlan }) {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="font-display text-3xl font-bold text-zinc-50 sm:text-4xl"
      >
        {greeting.text} {greeting.emoji}, {firstName || "Scholar"}! ✨
      </motion.h1>
      <p className="mt-3 max-w-md text-sm text-zinc-500">
        Ready to make today&rsquo;s study session actually count?
      </p>
      <button
        type="button"
        onClick={onGeneratePlan}
        className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-all hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white"
      >
        <span className="text-base leading-none">+</span>
        Generate Personalized Study Plan / Schedule
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Study grid
// ---------------------------------------------------------------------------

function StudyGrid({ onCardClick }) {
  return (
    <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {STUDY_MODULES.map((module, i) => {
        const Icon = module.icon;
        return (
          <motion.button
            key={module.id}
            type="button"
            onClick={() => onCardClick(module.id)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="group flex flex-col items-start rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-left backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-white/[0.07]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 transition-colors group-hover:text-indigo-200">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-zinc-100">{module.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{module.description}</p>
          </motion.button>
        );
      })}
    </div>
  );
}

function ComingSoonPanel({ navId }) {
  const item = NAV_ITEMS.find((n) => n.id === navId);
  const Icon = item?.icon || LayoutDashboard;
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 py-24 text-center text-zinc-500">
      <Icon className="mb-4 h-8 w-8" />
      <p className="text-sm">
        <span className="font-medium text-zinc-300">{item?.label}</span> lives here next &mdash;
        this build ships the Workspace experience first.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating AI input hub
// ---------------------------------------------------------------------------

function FloatingInputHub({
  activeSubject,
  promptText,
  setPromptText,
  attachedFile,
  onRemoveFile,
  onFileChange,
  fileInputRef,
  textareaRef,
  isListening,
  onToggleMic,
  onOpenSketch,
  isGenerating,
  onSubmit,
  errorMessage,
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-2xl">
        <div className="flex justify-center">
          <span className="mb-[-1px] rounded-t-xl border border-b-0 border-white/10 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400">
            {activeSubject.emoji} {activeSubject.label}
          </span>
        </div>

        <div className="rounded-3xl border border-white/10 bg-zinc-900/90 p-3 shadow-2xl backdrop-blur-2xl">
          {attachedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
              <Paperclip className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{attachedFile.name}</span>
              <button type="button" onClick={onRemoveFile} className="ml-auto text-zinc-500 hover:text-zinc-200">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={2}
            placeholder="Ask a question like a friend, or drop a picture/file to solve step-by-step..."
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
          />

          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={onFileChange}
              />
              <HubIconButton title="Attach a file" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
              </HubIconButton>
              <HubIconButton title="Sketch on a canvas" onClick={onOpenSketch}>
                <PenTool className="h-4 w-4" />
              </HubIconButton>
              <HubIconButton
                title={isListening ? "Stop dictating" : "Dictate a lecture"}
                onClick={onToggleMic}
                active={isListening}
              >
                <Mic className="h-4 w-4" />
              </HubIconButton>
            </div>

            <button
              type="button"
              onClick={onSubmit}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-indigo-500/50 disabled:cursor-wait disabled:opacity-70"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  Ask AI
                  <Send className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {errorMessage && (
          <p className="mt-2 text-center text-xs text-rose-400">{errorMessage}</p>
        )}
      </div>
    </div>
  );
}

function HubIconButton({ children, title, onClick, active }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={
        "flex h-8 w-8 items-center justify-center rounded-xl transition-colors " +
        (active ? "bg-rose-500/20 text-rose-300" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100")
      }
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Results drawer
// ---------------------------------------------------------------------------

const DRAWER_TABS = [
  { id: "summary", label: "Summary" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Quiz" },
  { id: "podcast", label: "Podcast" },
];

function ResultsDrawer({ studyPackage, activeTab, setActiveTab, onClose }) {
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-100">Your Study Package</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-white/10 px-3 py-2">
        {DRAWER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              "flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors " +
              (activeTab === tab.id ? "bg-white/10 text-zinc-50" : "text-zinc-500 hover:text-zinc-300")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {!studyPackage ? (
          <p className="text-sm text-zinc-500">Nothing generated yet.</p>
        ) : (
          <>
            {activeTab === "summary" && <SummaryTab studyPackage={studyPackage} />}
            {activeTab === "flashcards" && <FlashcardReview flashcards={studyPackage.flashcards} />}
            {activeTab === "quiz" && <QuizPractice quiz={studyPackage.quiz} />}
            {activeTab === "podcast" && <PodcastPlayer script={studyPackage.podcastScript} />}
          </>
        )}
      </div>
    </motion.div>
  );
}

function SummaryTab({ studyPackage }) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-zinc-300">{studyPackage.highLevelSummary}</p>
      {studyPackage.meta && (
        <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-zinc-500">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-zinc-400">Segments processed</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{studyPackage.meta.segments}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-zinc-400">Model</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{studyPackage.meta.model}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flashcards - session Leitner-style requeue
// ---------------------------------------------------------------------------

function FlashcardReview({ flashcards }) {
  const [queue, setQueue] = useState(() => flashcards.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [mastered, setMastered] = useState(0);
  const [reviewedAgain, setReviewedAgain] = useState(0);

  useEffect(() => {
    setQueue(flashcards.map((_, i) => i));
    setMastered(0);
    setReviewedAgain(0);
    setFlipped(false);
  }, [flashcards]);

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-400" />
        <p className="text-sm text-zinc-300">All caught up! {mastered} mastered this session.</p>
      </div>
    );
  }

  const currentCard = flashcards[queue[0]];

  function markKnown() {
    setMastered((m) => m + 1);
    setQueue((q) => q.slice(1));
    setFlipped(false);
  }

  function markAgain() {
    setReviewedAgain((r) => r + 1);
    setQueue((q) => [...q.slice(1), q[0]]);
    setFlipped(false);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{queue.length} left in this session</span>
        <span>
          {mastered} mastered · {reviewedAgain} reviewing again
        </span>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-[160px] w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-6 text-center transition-colors hover:bg-white/[0.07]"
      >
        <p className="text-xs uppercase tracking-wide text-zinc-500">{flipped ? "Answer" : "Question"}</p>
        <p className="mt-3 text-sm text-zinc-100">{flipped ? currentCard.back : currentCard.front}</p>
        <p className="mt-4 text-[11px] text-zinc-600">Tap to flip</p>
      </button>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={markAgain}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10"
        >
          Review again
        </button>
        <button
          type="button"
          onClick={markKnown}
          className="rounded-xl bg-emerald-500/90 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          I know this
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz practice (instant feedback, untimed)
// ---------------------------------------------------------------------------

function QuizPractice({ quiz }) {
  const [answers, setAnswers] = useState({});

  function selectAnswer(questionIndex, optionIndex) {
    setAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  }

  return (
    <div className="flex flex-col gap-5">
      {quiz.map((question, qIndex) => {
        const selected = answers[qIndex];
        const hasAnswered = selected !== undefined;
        return (
          <div key={qIndex} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-zinc-100">
              {qIndex + 1}. {question.question}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {question.options.map((option, oIndex) => {
                const isCorrect = oIndex === question.correctAnswerIndex;
                const isSelected = oIndex === selected;
                let style = "border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06]";
                if (hasAnswered && isCorrect) style = "border-emerald-400/50 bg-emerald-500/15 text-emerald-200";
                else if (hasAnswered && isSelected) style = "border-rose-400/50 bg-rose-500/15 text-rose-200";

                return (
                  <button
                    key={oIndex}
                    type="button"
                    disabled={hasAnswered}
                    onClick={() => selectAnswer(qIndex, oIndex)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${style}`}
                  >
                    {option}
                    {hasAnswered && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    {hasAnswered && isSelected && !isCorrect && <XCircle className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Podcast player - browser text-to-speech
// ---------------------------------------------------------------------------

function PodcastPlayer({ script }) {
  const [playingIndex, setPlayingIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  function play() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsPlaying(true);

    script.forEach((line, index) => {
      const utterance = new SpeechSynthesisUtterance(line.text);
      const isHarry = line.speaker.includes("Harry");
      utterance.pitch = isHarry ? 1.15 : 0.85;
      utterance.rate = isHarry ? 1.05 : 0.95;
      utterance.onstart = () => setPlayingIndex(index);
      if (index === script.length - 1) {
        utterance.onend = () => {
          setIsPlaying(false);
          setPlayingIndex(null);
        };
      }
      window.speechSynthesis.speak(utterance);
    });
  }

  function stop() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setIsPlaying(false);
    setPlayingIndex(null);
  }

  return (
    <div>
      <button
        type="button"
        onClick={isPlaying ? stop : play}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {isPlaying ? "Stop" : "Play as Audio"}
      </button>

      <div className="flex flex-col gap-3">
        {script.map((line, index) => {
          const isHarry = line.speaker.includes("Harry");
          return (
            <div
              key={index}
              className={
                "max-w-[90%] rounded-2xl px-4 py-2.5 text-sm transition-colors " +
                (isHarry ? "self-start bg-indigo-500/15 text-indigo-100" : "self-end bg-fuchsia-500/15 text-fuchsia-100") +
                (playingIndex === index ? " ring-1 ring-white/40" : "")
              }
              style={{ alignSelf: isHarry ? "flex-start" : "flex-end", display: "flex", flexDirection: "column" }}
            >
              <span className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {line.speaker}
              </span>
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sketch canvas modal
// ---------------------------------------------------------------------------

function SketchModal({ onClose }) {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
  }, []);

  function getPos(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event) {
    isDrawingRef.current = true;
    lastPointRef.current = getPos(event);
  }

  function handlePointerMove(event) {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const point = getPos(event);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }

  function handlePointerUp() {
    isDrawingRef.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = "novalis-sketch.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <ModalShell onClose={onClose} title="Sketch pad" icon={PenTool}>
      <canvas
        ref={canvasRef}
        width={560}
        height={380}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="w-full touch-none rounded-2xl border border-white/10"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
        >
          <Download className="h-4 w-4" />
          Save PNG
        </button>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Mock exam modal - timed, instant grading
// ---------------------------------------------------------------------------

const SECONDS_PER_QUESTION = 45;

function ExamModal({ quiz, onClose }) {
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [answers, setAnswers] = useState([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (finished) return undefined;
    if (secondsLeft <= 0) {
      advance(-1);
      return undefined;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, finished]);

  function advance(choiceIndex) {
    setAnswers((prev) => {
      const next = [...prev, choiceIndex];
      if (next.length >= quiz.length) setFinished(true);
      return next;
    });
    setIndex((i) => Math.min(i + 1, quiz.length - 1));
    setSecondsLeft(SECONDS_PER_QUESTION);
  }

  const score = answers.filter((answer, i) => answer === quiz[i]?.correctAnswerIndex).length;
  const progressPct = (secondsLeft / SECONDS_PER_QUESTION) * 100;

  if (finished) {
    return (
      <ModalShell onClose={onClose} title="Mock exam results" icon={Timer}>
        <div className="flex flex-col items-center py-4 text-center">
          <p className="text-4xl font-bold text-zinc-50">
            {score}/{quiz.length}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {score === quiz.length ? "Flawless run! 🎉" : "Solid attempt &mdash; review the misses below."}
          </p>
        </div>
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {quiz.map((question, i) => {
            const correct = answers[i] === question.correctAnswerIndex;
            return (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                <div className="flex items-center gap-2">
                  {correct ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <span className="text-zinc-300">{question.question}</span>
                </div>
                {!correct && (
                  <p className="mt-1.5 pl-6 text-zinc-500">
                    Correct answer: {question.options[question.correctAnswerIndex]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </ModalShell>
    );
  }

  const currentQuestion = quiz[index];

  return (
    <ModalShell onClose={onClose} title={`Question ${index + 1} of ${quiz.length}`} icon={Timer}>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-indigo-400"
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.9, ease: "linear" }}
        />
      </div>
      <div className="mb-4 flex items-center gap-1.5 text-xs text-zinc-500">
        <Clock className="h-3.5 w-3.5" />
        {secondsLeft}s left
      </div>
      <p className="text-sm font-medium text-zinc-100">{currentQuestion.question}</p>
      <div className="mt-4 flex flex-col gap-2">
        {currentQuestion.options.map((option, oIndex) => (
          <button
            key={oIndex}
            type="button"
            onClick={() => advance(oIndex)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/10"
          >
            {option}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Study plan architect modal
// ---------------------------------------------------------------------------

function StudyPlanModal({ subjectLabel, flashcards, onClose }) {
  const [examDate, setExamDate] = useState("");
  const [plan, setPlan] = useState(null);

  function generatePlan() {
    if (!examDate) return;

    const today = new Date();
    const exam = new Date(examDate);
    const totalDays = Math.max(1, Math.ceil((exam - today) / (1000 * 60 * 60 * 24)));
    const totalWeeks = Math.max(1, Math.min(12, Math.ceil(totalDays / 7)));

    const topics =
      flashcards && flashcards.length > 0
        ? flashcards.map((card) => card.front)
        : [
            `${subjectLabel} core concepts`,
            `${subjectLabel} worked examples`,
            `${subjectLabel} practice problems`,
            `${subjectLabel} past papers`,
            `${subjectLabel} final review`,
          ];

    const weeks = Array.from({ length: totalWeeks }, () => []);
    topics.forEach((topic, i) => weeks[i % totalWeeks].push(topic));

    setPlan(
      weeks.map((weekTopics, i) => ({
        week: i + 1,
        focus: weekTopics.length ? weekTopics : ["Light review & rest"],
      })),
    );
  }

  return (
    <ModalShell onClose={onClose} title="Study Plan Architect" icon={CalendarRange}>
      <p className="text-sm text-zinc-400">When is your {subjectLabel} test?</p>
      <div className="mt-3 flex gap-2">
        <input
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-400/60"
        />
        <button
          type="button"
          onClick={generatePlan}
          disabled={!examDate}
          className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Build plan
        </button>
      </div>

      {plan && (
        <div className="mt-5 flex max-h-72 flex-col gap-3 overflow-y-auto">
          {plan.map((week) => (
            <div key={week.week} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                Week {week.week}
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {week.focus.map((topic, i) => (
                  <li key={i} className="text-sm text-zinc-300">
                    &bull; {topic}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Shared modal shell
// ---------------------------------------------------------------------------

function ModalShell({ title, icon: Icon, onClose, children }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Icon className="h-4 w-4 text-indigo-300" />
            {title}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
