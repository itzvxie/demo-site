export const SUBJECTS = [
  { id: "bulgarian", label: "Bulgarian & Literature", emoji: "📖" },
  { id: "english", label: "English", emoji: "🇬🇧" },
  { id: "german", label: "German", emoji: "🇩🇪" },
  { id: "math", label: "Mathematics", emoji: "📐" },
  { id: "it", label: "IT", emoji: "💻" },
  { id: "physics", label: "Physics", emoji: "🧲" },
  { id: "chemistry", label: "Chemistry", emoji: "🧪" },
  { id: "biology", label: "Biology", emoji: "🧬" },
  { id: "history", label: "History", emoji: "📜" },
  { id: "geography", label: "Geography", emoji: "🌍" },
  { id: "philosophy", label: "Philosophy", emoji: "🧠" },
  { id: "other", label: "Other", emoji: "✨" },
];

// Groups the subject picker into clean sections instead of one long list.
export const SUBJECT_CATEGORIES = [
  { label: "Languages", subjectIds: ["bulgarian", "english", "german"] },
  { label: "STEM", subjectIds: ["math", "it", "physics", "chemistry", "biology"] },
  { label: "Humanities", subjectIds: ["history", "geography", "philosophy"] },
  { label: "General", subjectIds: ["other"] },
];

export function getSubject(id) {
  return SUBJECTS.find((subject) => subject.id === id) || SUBJECTS[0];
}

export const GOALS = [
  { id: "homework", label: "School Homework", emoji: "📚" },
  { id: "exams", label: "University Exams", emoji: "🎓" },
  { id: "passing", label: "Just trying to pass", emoji: "🙏" },
  { id: "fun", label: "Learning for fun", emoji: "💡" },
];
