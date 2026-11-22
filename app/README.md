# Objectif TCF Canada — reading & writing (v2)

A focused trainer for the two TCF Canada skills that are practised alone at a desk:
**compréhension écrite** and **expression écrite**. Target: **NCLC 7**.

| Skill | TCF Canada format | NCLC 7 needs |
| --- | --- | --- |
| Reading | 39 questions, 60 minutes, A1 → C2 | 453+ / 699 |
| Writing | 3 tasks, 60 minutes, marked /20 | 10 / 20 |

**No backend.** Everything runs in the browser and is saved on the device. The only
network call the app can make is the optional AI grading, which goes directly from the
browser to Anthropic with your own API key.

## Use it

- Online: `https://<user>.github.io/<repo>/v2/` once GitHub Pages is on.
- Offline: double-click `v2/index.html` (a single self-contained file).

## What's inside

**Reading**
- 76 questions (A1 10 · A2 14 · B1 16 · B2 16 · C1 11 · C2 9), all with French and English
  explanations; the 44 new ones also explain why each wrong option is wrong, and the A1–B1 ones
  have a glossary.
- Practice sets of 10 at your level and the next one; missed questions come back first;
  a timer shows the exam pace (≈ 92 s per question).
- Mock exam, full (39 q / 60 min) or short (20 q / 31 min): free navigation, flags, no feedback
  until the end, resumable after closing the tab. Result: estimated score with a range,
  CEFR level, NCLC level, accuracy by level, full correction.

**Writing**
- The 3 tasks, 5 prompts each, with model answers inside the word range, English
  translations of the prompts, a phrase bank and linking words to click in.
- Editor with French accent keys, live word count (TCF counting rule), autosave.
- **Automatic check on the device:** length, être/avoir auxiliaries, conditional or future
  after « si », elision, contractions, quantities, missing accents, register (tu/vous,
  familiar words), paragraphs, linking words, and the structure each task requires.
  Tuned to avoid false alarms; it is not a mark.
- **Optional AI feedback** (your own Anthropic API key): estimated mark /20, CEFR and NCLC,
  four criteria, every error quoted, corrected and explained in English, three priorities,
  and an improved version. It is an estimate against the public criteria, not an official mark.
- 60-minute writing mock with the three tasks in tabs, one clock, saved continuously.

## Privacy and the API key

- Progress: `localStorage` key `tcf.v2.state`. Export/restore a backup file from Settings.
- API key: `localStorage` key `tcf.v2.apikey`, **never** included in backups. Use a key with
  a spending limit, and don't save it on a shared computer.
- A graded text is sent from your browser to `api.anthropic.com`, nothing else.

## Develop

```bash
cd app
npm install
npm run dev        # local dev server
npm test           # unit tests (checker)
npm run build      # validate content → type-check → single-file build → ../v2/index.html
npm run e2e        # browser test on the built file (needs Playwright)
```

### Content

All content is JSON in `app/content/`, validated by `src/content/schema.ts` (zod) on every build:

- `reading.json` (extracted from the v1 app) and `reading-canada.json` (new): one document +
  one question each. `notes` (one English line per option), `glossary` and `whyEn` are optional.
- `writing.json`: the three tasks, their prompts and model answers. A model outside the task's
  word range fails the build.
- `structures.json`, `listening.json`, `lessons.json`, `cards.json`, `speaking.json`: extracted
  from v1 and kept for later modules.

Ids are permanent (progress refers to them). `scripts/extract-content.ts` was a one-time
migration and refuses to overwrite existing files.

### Level estimate

Reading uses a fixed-parameter logistic model with guessing (see `src/lib/score.ts`); item
difficulty is the author's CEFR label, so scores are shown with a range. NCLC conversions use
IRCC's published table, which can change — check canada.ca.
