export const SUBJECTS = [
  { id: "chemistry", label: "Chemistry", emoji: "🧪" },
  { id: "math", label: "Math", emoji: "📐" },
  { id: "physics", label: "Physics", emoji: "🧲" },
  { id: "biology", label: "Biology", emoji: "🧬" },
  { id: "history", label: "History", emoji: "📜" },
  { id: "other", label: "Other", emoji: "✨" },
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
