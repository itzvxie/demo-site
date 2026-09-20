"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coffee,
  Download,
  FileText,
  Headphones,
  History as HistoryIcon,
  Image as ImageIcon,
  LayoutDashboard,
  Layers,
  Link2,
  Loader2,
  LogOut,
  Mic,
  Moon,
  Paperclip,
  Pause,
  PenTool,
  Play,
  Plus,
  Send,
  Settings,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  deleteHistoryEntry,
  fetchHistory,
  fetchHistoryEntry,
  processStudyMaterial,
  saveHistoryEntry,
  updateHistoryEntry,
} from "@/lib/api";
import { SUBJECT_CATEGORIES, SUBJECTS, getSubject } from "@/lib/subjects";

const NAV_ITEMS = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "settings", label: "App Settings", icon: Settings },
];

const OUTPUT_OPTIONS = [
  { id: "notes", label: "Notes", description: "A clear, friendly summary of the material", icon: FileText },
  { id: "flashcards", label: "Flashcards", description: "Active-recall cards to drill", icon: Layers },
  { id: "quiz", label: "Smart Quizzes & Tests", description: "Multiple-choice practice, ready for a timed mock exam", icon: CheckCircle2 },
];

const UPLOAD_ACTIONS = [
  { id: "notes", title: "Upload your Notes", description: "Paste or type notes straight into the box below.", icon: PenTool },
  { id: "file", title: "Upload PDFs, Images", description: "Drop a PDF or photo and we'll read it for you.", icon: ImageIcon },
  { id: "youtube", title: "Paste a YouTube URL", description: "Turn any lecture or video into a full study package.", icon: Link2 },
];

function getGreeting(hour) {
  if (hour < 12) return { text: "Good morning", emoji: "☕", Icon: Coffee };
  if (hour < 18) return { text: "Good afternoon", emoji: "☀️", Icon: Sun };
  return { text: "Good evening", emoji: "🌙", Icon: Moon };
}

function timeAgo(isoString) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function DashboardWorkspace({ user, setUser, onSignOut }) {
  const [activeNav, setActiveNav] = useState("workspace");
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const [hour, setHour] = useState(() => new Date().getHours());

  const [promptText, setPromptText] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeInputOpen, setYoutubeInputOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [studyPackage, setStudyPackage] = useState(null);

  const [methodPickerOpen, setMethodPickerOpen] = useState(false);
  const [selectedOutputs, setSelectedOutputs] = useState(() => OUTPUT_OPTIONS.map((o) => o.id));

  const [showChat, setShowChat] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatSubject, setChatSubject] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [currentHistoryId, setCurrentHistoryId] = useState(null);
  const [chatSource, setChatSource] = useState(null);
  const [pendingOutput, setPendingOutput] = useState(null); // { backendId, tabId, label, icon, percent }
  const [flashcardCountPrompt, setFlashcardCountPrompt] = useState(null); // { tabId } while the count picker is open
  const progressIntervalRef = useRef(null);
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

  useEffect(() => {
    return () => clearInterval(progressIntervalRef.current);
  }, []);

  const greeting = getGreeting(hour);

  function selectSubject(id) {
    setUser((prev) => ({ ...prev, subject: id }));
    setSubjectMenuOpen(false);
  }

  function focusHub() {
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleUploadAction(actionId) {
    if (actionId === "notes") {
      focusHub();
      return;
    }
    if (actionId === "file") {
      fileInputRef.current?.click();
      return;
    }
    if (actionId === "youtube") {
      setYoutubeInputOpen(true);
      return;
    }
  }

  function toggleYoutubeInput() {
    setYoutubeInputOpen((open) => {
      if (open) setYoutubeUrl("");
      return !open;
    });
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      setErrorMessage("Only PDF and image uploads are processed by the AI right now.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1];
      setAttachedFile({ name: file.name, mimeType: file.type, base64 });
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

  function openMethodPicker() {
    const hasText = promptText.trim().length > 0;
    const hasDocument = Boolean(attachedFile?.base64);
    const hasYoutube = youtubeUrl.trim().length > 0;

    if (!hasText && !hasDocument && !hasYoutube) {
      setErrorMessage("Type a question, attach a file, or paste a YouTube URL before generating.");
      return;
    }
    setErrorMessage(null);
    setMethodPickerOpen(true);
  }

  function toggleOutput(id) {
    setSelectedOutputs((prev) => (prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]));
  }

  async function handleGenerate() {
    if (selectedOutputs.length === 0) {
      setErrorMessage("Pick at least one study method to generate.");
      return;
    }

    const hasDocument = Boolean(attachedFile?.base64);
    const hasYoutube = youtubeUrl.trim().length > 0;

    setMethodPickerOpen(false);
    setIsGenerating(true);
    setErrorMessage(null);

    // Kept alongside the package so "+" can regenerate a missing output
    // later without needing the original text/file/link still in the input
    // box - and so it can be saved to History for the same reason.
    const source = hasDocument
      ? { documentBase64: attachedFile.base64, mimeType: attachedFile.mimeType, fileName: attachedFile.name }
      : hasYoutube
        ? { youtubeUrl: youtubeUrl.trim() }
        : { text: promptText.trim() };

    try {
      const payload = { ...source, subject: activeSubject.label, outputs: selectedOutputs };
      const result = await processStudyMaterial(payload);
      const title =
        promptText.trim().slice(0, 80) || attachedFile?.name || (hasYoutube ? "YouTube video" : "Untitled");

      setStudyPackage(result);
      setChatQuestion(title);
      setChatSubject(activeSubject);
      setActiveTab(result.highLevelSummary ? "summary" : selectedOutputs[0]);
      setChatSource(source);
      setCurrentHistoryId(null);
      setShowChat(true);

      saveHistoryEntry({
        subject: activeSubject.label,
        title,
        sourceType: result.meta?.mode || "source",
        studyPackage: result,
        source,
      })
        .then((res) => setCurrentHistoryId(res.entry.id))
        .catch(() => {
          // Non-fatal: the package is already showing, just won't appear in History
          // (and a later "+" addition here won't be able to persist there either).
        });
    } catch (error) {
      setErrorMessage(error.message || "Something went wrong. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  function openHistoryEntry(entry) {
    fetchHistoryEntry(entry.id)
      .then((result) => {
        setStudyPackage(result.entry);
        setChatQuestion(entry.title);
        setChatSubject(getSubject(SUBJECTS.find((s) => s.label === entry.subject)?.id));
        setActiveTab(result.entry.highLevelSummary ? "summary" : "flashcards");
        setChatSource(result.source || null);
        setCurrentHistoryId(entry.id);
        setShowChat(true);
      })
      .catch((error) => setErrorMessage(error.message || "Couldn't open that entry."));
  }

  // Navigating away via the sidebar should always leave chat, not just
  // change which nav item is highlighted underneath it - it looked like the
  // sidebar didn't do anything if a chat was open, since the chat overlay
  // kept rendering regardless of activeNav.
  function handleSidebarSelect(id) {
    setActiveNav(id);
    setShowChat(false);
  }

  // Flashcards get an extra step first: ask how many before generating,
  // since "however many the AI feels like" isn't always the right amount.
  function requestAddOutput(backendId, tabId) {
    if (backendId === "flashcards") {
      setFlashcardCountPrompt({ tabId });
      return;
    }
    handleAddOutput(backendId, tabId);
  }

  function handleFlashcardCountPicked(count) {
    const tabId = flashcardCountPrompt?.tabId;
    setFlashcardCountPrompt(null);
    if (tabId) handleAddOutput("flashcards", tabId, count);
  }

  async function handleAddOutput(backendId, tabId, flashcardCount) {
    if (!chatSource || pendingOutput) return;

    const tabDef = CHAT_TAB_DEFS.find((t) => t.backendId === backendId);
    setErrorMessage(null);
    setActiveTab(tabId);
    setPendingOutput({ backendId, tabId, label: tabDef.label, icon: tabDef.icon, percent: 6 });

    // There's no real progress to report from a single request/response call,
    // so this eases toward ~92% and only jumps to 100% once the response
    // actually lands - a genuine wait still reads as visible progress
    // instead of an indefinite spinner.
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      setPendingOutput((prev) => {
        if (!prev || prev.percent >= 92) return prev;
        const step = Math.max(1, Math.round((92 - prev.percent) * 0.15));
        return { ...prev, percent: Math.min(92, prev.percent + step) };
      });
    }, 220);

    try {
      const payload = {
        ...chatSource,
        subject: chatSubject?.label || activeSubject.label,
        outputs: [backendId],
        ...(flashcardCount ? { flashcardCount } : {}),
      };
      const result = await processStudyMaterial(payload);
      clearInterval(progressIntervalRef.current);
      setPendingOutput((prev) => (prev ? { ...prev, percent: 100 } : prev));

      const merged = {
        ...studyPackage,
        ...result,
        meta: { ...studyPackage.meta, outputs: [...(studyPackage.meta?.outputs || []), backendId] },
      };

      await new Promise((resolve) => setTimeout(resolve, 350)); // let the 100% register before swapping in real content
      setStudyPackage(merged);
      setPendingOutput(null);

      if (currentHistoryId) {
        updateHistoryEntry(currentHistoryId, merged).catch(() => {
          // Non-fatal: the live view already has it, History just won't reflect it yet.
        });
      }
    } catch (error) {
      clearInterval(progressIntervalRef.current);
      setPendingOutput(null);
      setActiveTab("summary");
      setErrorMessage(error.message || "Couldn't add that. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-400">
      <Sidebar activeNav={activeNav} onSelect={handleSidebarSelect} />

      <div className="flex-1 pl-20 sm:pl-24">
        <TopBar
          activeSubject={activeSubject}
          subjectMenuOpen={subjectMenuOpen}
          setSubjectMenuOpen={setSubjectMenuOpen}
          onSelectSubject={selectSubject}
          user={user}
          onSignOut={onSignOut}
          hideSubject={showChat}
        />

        <main
          className={
            showChat
              ? "relative mx-auto flex h-[calc(100vh-73px)] max-w-3xl flex-col px-6 sm:px-10"
              : "relative mx-auto max-w-5xl px-6 pb-56 pt-16 sm:px-10"
          }
        >
          {showChat ? (
            <ChatView
              studyPackage={studyPackage}
              question={chatQuestion}
              subject={chatSubject}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onStartExam={() => setExamOpen(true)}
              canAddOutputs={Boolean(chatSource)}
              pendingOutput={pendingOutput}
              onAddOutput={requestAddOutput}
            />
          ) : activeNav === "workspace" ? (
            <>
              <Hero greeting={greeting} firstName={user.firstName} onGeneratePlan={() => setPlanOpen(true)} />
              <UploadOptions onAction={handleUploadAction} />
            </>
          ) : activeNav === "history" ? (
            <HistoryPanel onOpenEntry={openHistoryEntry} />
          ) : (
            <ComingSoonPanel navId={activeNav} />
          )}
        </main>
      </div>

      {(activeNav === "workspace" || showChat) && (
        <FloatingInputHub
          activeSubject={activeSubject}
          promptText={promptText}
          setPromptText={setPromptText}
          attachedFile={attachedFile}
          onRemoveFile={() => setAttachedFile(null)}
          onFileChange={handleFileChange}
          fileInputRef={fileInputRef}
          textareaRef={textareaRef}
          youtubeUrl={youtubeUrl}
          setYoutubeUrl={setYoutubeUrl}
          youtubeInputOpen={youtubeInputOpen}
          onToggleYoutubeInput={toggleYoutubeInput}
          onCloseYoutubeInput={() => {
            setYoutubeInputOpen(false);
            setYoutubeUrl("");
          }}
          isListening={isListening}
          onToggleMic={toggleMic}
          onOpenSketch={() => setSketchOpen(true)}
          isGenerating={isGenerating}
          onSubmit={openMethodPicker}
          errorMessage={errorMessage}
          hideSubjectTag={showChat}
        />
      )}

      <AnimatePresence>
        {methodPickerOpen && (
          <MethodPickerModal
            selected={selectedOutputs}
            onToggle={toggleOutput}
            onClose={() => setMethodPickerOpen(false)}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{sketchOpen && <SketchModal onClose={() => setSketchOpen(false)} />}</AnimatePresence>

      <AnimatePresence>
        {flashcardCountPrompt && (
          <FlashcardCountModal
            onPick={handleFlashcardCountPicked}
            onClose={() => setFlashcardCountPrompt(null)}
          />
        )}
      </AnimatePresence>

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

function TopBar({ activeSubject, subjectMenuOpen, setSubjectMenuOpen, onSelectSubject, user, onSignOut, hideSubject }) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-zinc-950/70 px-6 py-4 backdrop-blur sm:px-10">
      {!hideSubject && (
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
                className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-xl"
              >
                <div className="max-h-96 overflow-y-auto pr-0.5">
                  {SUBJECT_CATEGORIES.map((category, catIndex) => (
                    <div key={category.label} className={catIndex > 0 ? "mt-1 border-t border-white/5 pt-1" : ""}>
                      <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                        {category.label}
                      </p>
                      {category.subjectIds.map((id) => {
                        const subject = SUBJECTS.find((s) => s.id === id);
                        if (!subject) return null;
                        return (
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
                        );
                      })}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="relative ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => setAccountMenuOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 text-sm font-semibold text-white transition-transform hover:scale-105"
        >
          {(user.firstName || "S").charAt(0).toUpperCase()}
        </button>

        <AnimatePresence>
          {accountMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-xl"
            >
              <div className="px-3 py-2 text-xs text-zinc-500">
                Signed in as <span className="text-zinc-300">{user.firstName || "Scholar"}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onSignOut?.();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-rose-300 transition-colors hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
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
// Upload options - replaces the old six-card module grid with three clean
// entry points into the same floating input hub below.
// ---------------------------------------------------------------------------

function UploadOptions({ onAction }) {
  return (
    <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {UPLOAD_ACTIONS.map((action, i) => {
        const Icon = action.icon;
        return (
          <motion.button
            key={action.id}
            type="button"
            onClick={() => onAction(action.id)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group flex flex-col items-start rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-left backdrop-blur-xl transition-colors hover:border-indigo-400/30 hover:bg-white/[0.07]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 transition-colors group-hover:text-indigo-200">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-zinc-100">{action.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{action.description}</p>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History panel
// ---------------------------------------------------------------------------

function HistoryPanel({ onOpenEntry }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchHistory()
      .then((data) => setEntries(data.entries))
      .catch((err) => setError(err.message || "Couldn't load your history."));
  }, []);

  function handleDelete(id, event) {
    event.stopPropagation();
    setDeletingId(id);
    deleteHistoryEntry(id)
      .then(() => setEntries((prev) => prev.filter((e) => e.id !== id)))
      .catch((err) => setError(err.message || "Couldn't delete that entry."))
      .finally(() => setDeletingId(null));
  }

  if (error) {
    return <p className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</p>;
  }

  if (entries === null) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 py-24 text-center text-zinc-500">
        <HistoryIcon className="mb-4 h-8 w-8" />
        <p className="text-sm">
          Nothing generated yet &mdash; everything you ask the AI shows up here afterward.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="mb-2 text-sm font-semibold text-zinc-300">Previous study sessions</h2>
      {entries.map((entry) => {
        const subject = getSubject(SUBJECTS.find((s) => s.label === entry.subject)?.id);
        return (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenEntry(entry)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenEntry(entry);
              }
            }}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-base">
              {subject.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-zinc-100">{entry.title}</span>
              <span className="block text-xs text-zinc-500">
                {entry.subject} &middot; {timeAgo(entry.created_at)}
              </span>
            </span>
            <button
              type="button"
              title="Delete"
              onClick={(e) => handleDelete(entry.id, e)}
              disabled={deletingId === entry.id}
              className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
            >
              {deletingId === entry.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
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
// Generate-method picker - choose what the AI produces before it runs
// ---------------------------------------------------------------------------

function MethodPickerModal({ selected, onToggle, onClose, onGenerate, isGenerating }) {
  return (
    <ModalShell onClose={onClose} title="What do you want to generate?" icon={Sparkles}>
      <div className="flex flex-col gap-2.5">
        {OUTPUT_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              className={
                "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors " +
                (isSelected
                  ? "border-indigo-400/50 bg-indigo-500/10"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]")
              }
            >
              <div
                className={
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
                  (isSelected ? "bg-indigo-500/20 text-indigo-300" : "bg-white/5 text-zinc-400")
                }
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100">{option.label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{option.description}</p>
              </div>
              <div
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors " +
                  (isSelected ? "border-indigo-400 bg-indigo-500 text-white" : "border-white/20")
                }
              >
                {isSelected && <Check className="h-3.5 w-3.5" />}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-indigo-500/50 disabled:cursor-wait disabled:opacity-70"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          "Generate"
        )}
      </button>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Flashcard count picker - shown when adding Flashcards from the "+" menu
// ---------------------------------------------------------------------------

const FLASHCARD_COUNT_OPTIONS = [
  { count: 10, label: "10 cards", description: "Quick review" },
  { count: 20, label: "20 cards", description: "Solid coverage" },
  { count: 30, label: "30 cards", description: "Deep study" },
  { count: null, label: "I don't know", description: "Let the AI decide" },
];

function FlashcardCountModal({ onPick, onClose }) {
  return (
    <ModalShell onClose={onClose} title="How many flashcards?" icon={Layers}>
      <div className="grid grid-cols-2 gap-2.5">
        {FLASHCARD_COUNT_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onPick(option.count)}
            className="flex flex-col items-start gap-0.5 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/10"
          >
            <p className="text-sm font-semibold text-zinc-100">{option.label}</p>
            <p className="text-xs text-zinc-500">{option.description}</p>
          </button>
        ))}
      </div>
    </ModalShell>
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
  youtubeUrl,
  setYoutubeUrl,
  youtubeInputOpen,
  onToggleYoutubeInput,
  onCloseYoutubeInput,
  isListening,
  onToggleMic,
  onOpenSketch,
  isGenerating,
  onSubmit,
  errorMessage,
  hideSubjectTag,
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-2xl">
        {!hideSubjectTag && (
          <div className="flex justify-center">
            <span className="mb-[-1px] rounded-t-xl border border-b-0 border-white/10 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400">
              {activeSubject.emoji} {activeSubject.label}
            </span>
          </div>
        )}

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

          {youtubeInputOpen && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <input
                type="url"
                autoFocus
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Paste a YouTube link..."
                className="w-full bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
              />
              <button type="button" onClick={onCloseYoutubeInput} className="ml-auto text-zinc-500 hover:text-zinc-200">
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
              <HubIconButton title="Paste a YouTube URL" onClick={onToggleYoutubeInput} active={youtubeInputOpen}>
                <Link2 className="h-4 w-4" />
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
        (active ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100")
      }
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chat view - what a generated (or reopened) study package looks like:
// small browser-style tabs for each output up top, the question and the
// AI's answer laid out as plain message bubbles below, no avatars.
// ---------------------------------------------------------------------------

const CHAT_TAB_DEFS = [
  { id: "summary", backendId: "notes", label: "Notes", field: "highLevelSummary", icon: FileText },
  { id: "flashcards", backendId: "flashcards", label: "Flashcards", field: "flashcards", icon: Layers },
  { id: "quiz", backendId: "quiz", label: "Quiz", field: "quiz", icon: CheckCircle2 },
];

function ProgressRing({ percent, size = 14 }) {
  const strokeWidth = size <= 16 ? 2 : 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-200 ease-out"
      />
    </svg>
  );
}

function ChatView({
  studyPackage,
  question,
  subject,
  activeTab,
  setActiveTab,
  onStartExam,
  canAddOutputs,
  pendingOutput,
  onAddOutput,
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const availableTabs = CHAT_TAB_DEFS.filter((tab) => {
    const value = studyPackage?.[tab.field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
  const missingTabs = CHAT_TAB_DEFS.filter(
    (tab) => !availableTabs.includes(tab) && tab.backendId !== pendingOutput?.backendId,
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col"
    >
      <div className="flex items-center gap-3 pt-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-base">
          {subject?.emoji || "✨"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{question}</p>
          {subject?.label && <p className="text-xs text-zinc-500">{subject.label}</p>}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1">
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={
                  "flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors " +
                  (isActive
                    ? "border-white/10 bg-white/[0.06] text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}

          {pendingOutput && (
            <motion.button
              key={pendingOutput.tabId}
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setActiveTab(pendingOutput.tabId)}
              className={
                "flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium text-indigo-300 transition-colors " +
                (activeTab === pendingOutput.tabId ? "border-white/10 bg-white/[0.06]" : "border-transparent hover:text-indigo-200")
              }
            >
              <ProgressRing percent={pendingOutput.percent} />
              {pendingOutput.label}
              <span className="tabular-nums text-[10px] text-indigo-300/80">{pendingOutput.percent}%</span>
            </motion.button>
          )}

          {canAddOutputs && missingTabs.length > 0 && !pendingOutput && (
            <div className="relative">
              <button
                type="button"
                title="Add more"
                onClick={() => setAddMenuOpen((open) => !open)}
                className="flex items-center rounded-t-lg border border-b-0 border-transparent px-2 py-1.5 text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>

              <AnimatePresence>
                {addMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur-xl"
                  >
                    {missingTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setAddMenuOpen(false);
                            onAddOutput(tab.backendId, tab.id);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/5"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          Add {tab.label}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
      </div>
      <div className="h-px bg-white/10" />

      {activeTab === "flashcards" || activeTab === "quiz" ? (
        // Full-focus mode: flashcards and quizzes get the whole panel to
        // themselves - no chat bubbles, no echoed question, just the study
        // material, per the "nothing else" ask.
        <div className="flex flex-1 flex-col overflow-y-auto py-6 pb-36">
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
            {!studyPackage ? (
              <p className="text-sm text-zinc-500">Nothing generated yet.</p>
            ) : activeTab === pendingOutput?.tabId ? (
              <PendingFocusBlock label={pendingOutput.label} percent={pendingOutput.percent} />
            ) : activeTab === "flashcards" ? (
              <FlashcardReview flashcards={studyPackage.flashcards} />
            ) : (
              <QuizPractice quiz={studyPackage.quiz} onStartExam={onStartExam} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-6 pb-36">
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <div className="max-w-[75%] rounded-2xl rounded-br-md bg-indigo-500/15 px-4 py-2.5 text-sm text-zinc-100">
                {question}
              </div>
            </div>

            {!studyPackage ? (
              <p className="text-sm text-zinc-500">Nothing generated yet.</p>
            ) : activeTab === pendingOutput?.tabId ? (
              <div className="flex justify-start">
                <div className="flex w-full max-w-[85%] flex-col items-center gap-3 rounded-2xl rounded-bl-md bg-white/[0.04] px-4 py-8 text-center">
                  <div className="relative flex h-14 w-14 items-center justify-center text-indigo-300">
                    <ProgressRing percent={pendingOutput.percent} size={56} />
                    <motion.span
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute text-xs font-semibold tabular-nums text-indigo-200"
                    >
                      {pendingOutput.percent}%
                    </motion.span>
                  </div>
                  <p className="text-sm text-zinc-300">
                    Generating your {pendingOutput.label.toLowerCase()}
                    <motion.span
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      &hellip;
                    </motion.span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="w-full max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.04] px-4 py-3.5 text-sm text-zinc-200">
                  {activeTab === "summary" && <SummaryTab studyPackage={studyPackage} />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function PendingFocusBlock({ label, percent }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center text-indigo-300">
        <ProgressRing percent={percent} size={64} />
        <motion.span
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute text-xs font-semibold tabular-nums text-indigo-200"
        >
          {percent}%
        </motion.span>
      </div>
      <p className="text-sm text-zinc-300">
        Generating your {label.toLowerCase()}
        <motion.span
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          &hellip;
        </motion.span>
      </p>
    </div>
  );
}

function SummaryTab({ studyPackage }) {
  return <p className="text-sm leading-relaxed text-zinc-300">{studyPackage.highLevelSummary}</p>;
}

// ---------------------------------------------------------------------------
// Flashcards - session Leitner-style requeue
// ---------------------------------------------------------------------------

function FlashcardReview({ flashcards }) {
  const [queue, setQueue] = useState(() => flashcards.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [mastered, setMastered] = useState(0);
  const [reviewedAgain, setReviewedAgain] = useState(0);
  const total = flashcards.length;

  useEffect(() => {
    setQueue(flashcards.map((_, i) => i));
    setMastered(0);
    setReviewedAgain(0);
    setFlipped(false);
  }, [flashcards]);

  if (queue.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-400" />
        <p className="text-base font-medium text-zinc-100">All caught up!</p>
        <p className="mt-1 text-sm text-zinc-500">
          {mastered} of {total} mastered this session.
        </p>
      </div>
    );
  }

  const currentCard = flashcards[queue[0]];
  const cardNumber = total - queue.length + 1;

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
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          Card {cardNumber} of {total}
        </span>
        <span>
          {mastered} mastered · {reviewedAgain} reviewing again
        </span>
      </div>
      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400"
          animate={{ width: `${((cardNumber - 1) / total) * 100}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>

      <div className="flex flex-1 items-center justify-center py-4 [perspective:1400px]">
        <AnimatePresence mode="wait">
          <motion.button
            key={queue[0]}
            type="button"
            onClick={() => setFlipped((f) => !f)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="relative min-h-[300px] w-full [transform-style:preserve-3d]"
            style={{
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              transition: "transform 0.5s cubic-bezier(0.4, 0.2, 0.2, 1)",
            }}
          >
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-8 text-center shadow-xl [backface-visibility:hidden]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/80">Question</p>
              <p className="mt-5 text-xl font-medium leading-relaxed text-zinc-100">{currentCard.front}</p>
              <p className="mt-6 text-[11px] text-zinc-600">Tap to reveal the answer</p>
            </div>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 to-white/[0.02] p-8 text-center shadow-xl [backface-visibility:hidden]"
              style={{ transform: "rotateY(180deg)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Answer</p>
              <p className="mt-5 text-xl font-medium leading-relaxed text-zinc-100">{currentCard.back}</p>
              <p className="mt-6 text-[11px] text-zinc-600">Tap to flip back</p>
            </div>
          </motion.button>
        </AnimatePresence>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={markAgain}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10"
        >
          Review again
        </button>
        <button
          type="button"
          onClick={markKnown}
          className="rounded-2xl bg-emerald-500/90 px-4 py-3.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
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

function QuizPractice({ quiz, onStartExam }) {
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    setAnswers({});
  }, [quiz]);

  function selectAnswer(questionIndex, optionIndex) {
    setAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  }

  const answeredCount = Object.keys(answers).length;
  const correctCount = quiz.reduce(
    (sum, question, qIndex) => sum + (answers[qIndex] === question.correctAnswerIndex ? 1 : 0),
    0,
  );
  const allAnswered = answeredCount === quiz.length;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/80">Quiz</p>
          <p className="mt-1 text-sm text-zinc-500">
            {answeredCount} of {quiz.length} answered
          </p>
        </div>
        {onStartExam && (
          <button
            type="button"
            onClick={onStartExam}
            className="flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2.5 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20"
          >
            <Timer className="h-4 w-4" />
            Timed Mock Exam
          </button>
        )}
      </div>

      <AnimatePresence>
        {allAnswered && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 px-5 py-4 text-center"
          >
            <p className="text-2xl font-semibold text-zinc-100">
              {correctCount}/{quiz.length}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {correctCount === quiz.length
                ? "Perfect score! Nice work."
                : "correct — review the highlighted answers below"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

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
