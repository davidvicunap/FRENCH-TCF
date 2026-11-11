# Objectif TCF 🇫🇷

A self-contained site for learning French and preparing the **TCF** (*Test de
connaissance du français*, run by France Éducation international): grammar from
A1 to C1, listening, reading, writing, speaking, vocabulary, and timed mock exams
that follow the structure of the version you are sitting.

**It is a single file.** All the HTML, CSS and JavaScript are inlined into
`index.html` — nothing to install, bundle, or serve.

- **No backend, no accounts, no build step, no tracking.**
- **Progress is saved automatically** in the browser (`localStorage`) and can be
  **exported to a backup file** and restored on any device.
- **Works offline.** Listening exercises use the browser's built-in French voice.
- Dark/light theme, mobile-first, keyboard navigable (A–D to answer).

## What it is — and what it is not

| | |
| --- | --- |
| ✅ A structured course | 19 lessons that explain *why* before drilling, each with corrected exercises |
| ✅ Exam practice | 154 questions, mock exams with one clock per test, a level estimate per skill |
| ✅ Memory | spaced-repetition vocabulary (106 cards), and a queue that brings back every question you got wrong |
| ✅ Production | the 3 writing and 3 speaking tasks in their real format, with several prompts, models, timers and recording |
| ❌ Not a from-zero course | the *Fondations* section reviews A1–A2 grammar, but the interface and explanations assume you can already read simple French |
| ❌ Not a grader | nothing here can mark your writing or speaking — have a teacher or a French speaker correct you regularly (the *Copier pour correction* button prepares the request) |
| ❌ Not real exam audio | recordings are read by your device's synthetic voice: fine for training your ear to meaning, less varied than the accents of the real test |
| ❌ Not an official score | see [About the estimated level](#about-the-estimated-level) |

## Run it

Double-click `index.html`, or serve the folder:

```bash
python -m http.server 8000
```

To publish on GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

## First steps

1. Open **⚙ Réglages** and set your TCF version, target level and exam date. The
   mock exam and the dashboard adapt to them.
2. Take a short mock exam to find your level.
3. Follow **Aujourd'hui** on the home page each day: cards due, mistakes to
   review, the next lesson, a writing or speaking prompt.
4. **Export a backup** from *Réglages* once in a while.

## How your progress is saved

- Every answer, card rating, checklist tick and keystroke of a draft is written to
  `localStorage` under the key `tcf.state.v1`. A mock exam in progress is saved
  continuously and can be resumed after closing the tab.
- If the browser refuses to store data (private browsing, blocked or full storage),
  a red banner says so instead of failing silently.
- Two tabs open at once stay in sync; neither overwrites the other.
- Progress lives in **one browser on one device**. It does not sync, and clearing
  site data erases it (Safari may also clear a site left unvisited for a week).
  *Réglages → Exporter ma sauvegarde* downloads a JSON file you can restore
  anywhere; *Protéger le stockage* asks the browser not to evict the data.
- Voice recordings are not stored — download the ones you want to keep.
- Save files from earlier versions of the app load unchanged.

Reset from *Réglages*, or in the console: `localStorage.removeItem("tcf.state.v1")`.

## What's inside

### Le parcours — 19 lessons

| Section | Lessons | Focus |
| --- | --- | --- |
| 🧭 **Comprendre le TCF** | 3 | Which version to sit, the 100–699 scale and the marks out of 20, time management |
| 🧱 **Les fondations** (A1–A2) | 5 | Present tense, articles and quantities, questions and negation, future, forming the past tenses |
| 🔧 **Maîtrise des structures** (B1–C1) | 7 | Passé composé vs imparfait, subjunctive, pronouns, relatives and connectors, false friends and register, conditional and hypothesis, reported speech and passive |
| 👂 **Compréhension orale** | 2 | Selective listening and distractors, implied meaning and tone |
| 📖 **Compréhension écrite** | 2 | Scanning short documents, implicit meaning in argumentative texts |

### S'entraîner

- **🎯 Entraînement par épreuve** — sets of 10 questions per skill around your target
  level, corrected one by one, least-seen questions first.
- **🩹 Mes erreurs** — every question missed anywhere comes back until you get it right.
- **✍️ Expression écrite** — the 3 task types (60–120, 120–150, 120–180 words), three
  prompts each, timer, live word count using the official counting rule, automatic
  indicators (length, paragraphs, connectors found), model answers, self-assessment grid.
- **🎙️ Expression orale** — task 1 (2 min), task 2 (2 min preparation + 3 min 30),
  task 3 (4 min 30, no preparation); several prompts, spoken examiner questions,
  timers, in-browser recording with download.
- **🗂️ Vocabulaire** — Leitner spaced repetition (5 boxes, 0/1/3/7/21 days), a daily
  limit of new cards, French→English or English→French, searchable list.
- **⏱️ Examen blanc** — see below.
- **📊 Barème** — score-to-level converter, marks out of 20, NCLC table for TCF Canada.

### The mock exam

Built like the real test: one test after another, each with its own clock, questions
in increasing difficulty, no correction before the end. Listening allows a single
listen and no going back; reading and structures allow free navigation.

| Version chosen | Short format | Long format |
| --- | --- | --- |
| Tout Public / DAP | listening 15 + structures 9 + reading 15, 44 min | up to 29 + 18 + 29, 85 min |
| Canada / Québec | listening 20 + reading 20, 49 min | as many as the bank holds (real test: 39 + 39) |
| IRN | listening 13 + reading 13, levels A1–B2 | 25 + 25 |

The result gives an estimated level and indicative score **per test**, a breakdown by
difficulty level, the share of questions you had never seen, and a full correction.

### About the estimated level

A raw percentage is misleading: 25 % is what random ticking earns. The estimate uses
a fixed-parameter logistic model that accounts for each question's difficulty (its
CEFR label) and for guessing, then maps the result onto the TCF scale (400 = start of
B2). Random answers land below A2 in about 97 % of simulated exams.

It remains **an estimate, not an official conversion**: the questions were levelled by
their author, not calibrated on thousands of candidates, and a short exam is
imprecise — hence the range shown beside every score. After two or three mock exams
questions start to repeat. Use it to track progress and find your weakest test.

## Exam facts

Formats, timings and scales in the app were checked against France Éducation
international's published information (and canada.ca for the NCLC table) in
November 2026. They change — the TCF IRN changed in May 2025 and the TCF Québec is
being adapted. This is an **independent practice tool with no affiliation to France
Éducation international**: confirm the current format, the level required and the
validity period on the official site and with the institution asking for the test.

## Listening and voices

Audio comes from the browser's speech synthesis. Dialogues alternate two voices
when the device has several French voices.

- macOS, iOS, Windows and most Android devices ship a French voice.
- Chrome on Linux often has none. The app says so and shows the text instead, in
  exercises and in the mock exam.
- *Réglages → Audio* lists the available voices and explains how to install one.

## Editing the content

Everything lives in `index.html`; search for the constant you need.

| Constant | Content |
| --- | --- |
| `SECTIONS` | sections, lessons (`content` is HTML) and their drills |
| `EXAM_BANK` | exam-only questions, with `skill: "co" \| "msl" \| "ce"` |
| `WRITING_TASKS`, `SPEAKING_TASKS` | task types, each with a `prompts` array |
| `FLASHCARDS` | vocabulary cards (`ex` adds an example sentence) |
| `TCF_VERSIONS` | exam structure per version |
| `ACHIEVEMENTS` | achievements |

An exercise item is one of:

```js
{ type: "mcq",    id, level, q, options: [...], a: <index>, why, gloss? }
{ type: "gap",    id, level, q, answers: [...], why, gloss? }
{ type: "read",   id, level, context: "<text>", q, options, a, why }
{ type: "listen", id, level, audio: "<French read aloud>", q, options, a, why }
```

- `level` is one of `A1 A2 B1 B2 C1 C2`. Ids must be unique across the whole file.
- Options are shuffled each time a question is shown (`fixed: true` keeps their order).
- In `audio`, `—` separates the speakers of a dialogue; don't use it as punctuation.
- Never rename an existing id: saved progress refers to it.

After editing, open **`index.html#/diagnostic`**: it lists duplicate ids, answers out
of range, unbalanced HTML tags, model answers outside their word range, and shows the
number of exam questions per skill and level.

## Tests

`tests/e2e.js` drives the app in a real browser: every route, saving and reloading,
multi-tab sync, blocked storage, the mock exam (including resume), backup round trip,
loading a save from the previous version. It needs [Playwright](https://playwright.dev):

```bash
node tests/e2e.js
```
