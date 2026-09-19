import { Router } from "express";
import { readSession } from "../auth/tokens.js";
import { listHistoryForUser, findHistoryEntry, createHistoryEntry, deleteHistoryEntry } from "../db.js";

const router = Router();

function requireSession(req, res) {
  const claims = readSession(req);
  if (!claims) {
    res.status(401).json({ error: "Not signed in." });
    return null;
  }
  return claims;
}

router.get("/", async (req, res) => {
  const claims = requireSession(req, res);
  if (!claims) return;

  try {
    const entries = await listHistoryForUser(claims.sub);
    res.json({ entries });
  } catch (error) {
    console.error("[novalis-ai] Failed to list history:", error.message);
    res.status(500).json({ error: "Couldn't load your history. Please try again." });
  }
});

router.get("/:id", async (req, res) => {
  const claims = requireSession(req, res);
  if (!claims) return;

  try {
    const entry = await findHistoryEntry(req.params.id, claims.sub);
    if (!entry) return res.status(404).json({ error: "That study package couldn't be found." });
    res.json({ entry: { ...entry.study_package, meta: { ...entry.study_package.meta, id: entry.id } } });
  } catch (error) {
    console.error("[novalis-ai] Failed to load history entry:", error.message);
    res.status(500).json({ error: "Couldn't load that entry. Please try again." });
  }
});

router.post("/", async (req, res) => {
  const claims = requireSession(req, res);
  if (!claims) return;

  const { subject, title, sourceType, studyPackage } = req.body ?? {};
  if (!subject || !title || !sourceType || !studyPackage) {
    return res.status(400).json({ error: "subject, title, sourceType and studyPackage are required." });
  }

  try {
    const entry = await createHistoryEntry({
      userId: claims.sub,
      subject: String(subject).slice(0, 80),
      title: String(title).slice(0, 200),
      sourceType: String(sourceType).slice(0, 40),
      studyPackage,
    });
    res.status(201).json({ entry });
  } catch (error) {
    console.error("[novalis-ai] Failed to save history entry:", error.message);
    res.status(500).json({ error: "Couldn't save that to your history. Please try again." });
  }
});

router.delete("/:id", async (req, res) => {
  const claims = requireSession(req, res);
  if (!claims) return;

  try {
    const deleted = await deleteHistoryEntry(req.params.id, claims.sub);
    if (!deleted) return res.status(404).json({ error: "That entry couldn't be found." });
    res.status(204).end();
  } catch (error) {
    console.error("[novalis-ai] Failed to delete history entry:", error.message);
    res.status(500).json({ error: "Couldn't delete that entry. Please try again." });
  }
});

export default router;
