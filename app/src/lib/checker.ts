/**
 * Local writing checker — runs entirely in the browser, no network.
 *
 * It catches mechanical problems an examiner penalises and a learner can fix
 * alone: length, missing elision, frequent agreement/auxiliary errors,
 * conditional after « si », missing accents on common words, register
 * mixing, and the structural requirements of each TCF task.
 *
 * Every rule is tuned for precision over recall: it is better to miss an
 * error than to flag correct French. It is NOT a grade — see the AI grader
 * (optional) or, better, a teacher.
 */
import { countWords } from "./words";

export type Severity = "error" | "warning" | "tip";
export interface Issue {
  rule: string;
  severity: Severity;
  /** The exact text that triggered the rule (empty for whole-text checks). */
  quote: string;
  /** Suggested replacement, when there is one. */
  fix?: string;
  /** Explanation in English. */
  message: string;
}

export interface TaskSpec { n: 1 | 2 | 3; min: number; max: number }

const APOS = /[’ʼ`]/g;
const norm = (s: string) => s.replace(APOS, "'");

/** Unicode-aware word boundary: JavaScript's \\b treats « è » as a non-letter. */
const WB = "(?:(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}]))";
/** Build a unicode regex in which \\b means a real word boundary. */
const rx = (source: string, flags = "giu") => new RegExp(source.replaceAll("\\b", WB), flags);

/* ---------- rules: (regex over normalised text) → issue ---------- */

interface PatternRule {
  rule: string;
  severity: Severity;
  re: RegExp;
  fix?: (m: RegExpExecArray) => string;
  message: string | ((m: RegExpExecArray) => string);
}

const VOWEL = "aeiouàâäéèêëîïôöùûüœæAEIOUÀÂÉÈÊÎÔÛŒ"; // not y: « le yaourt », « le yoga »
const W = "[\\p{L}'-]";

/** Verbs whose passé composé takes « être » and that are (almost) never transitive. */
const ETRE_PARTICIPLES =
  "allée?s?|venue?s?|arrivée?s?|partie?s?|restée?s?|née?s?|tombée?s?|devenue?s?|morte?s?|revenue?s?|parvenue?s?|décédée?s?";

/** Conditional forms that must not follow « si » (hypothesis). */
const CONDITIONALS =
  "(?:aur|ser|fer|ir|pourr|voudr|devr|saur|viendr|verr|faudr|\\p{L}+er)(?:ais|ait|ions|iez|aient)";
const FUTURES = "(?:aur|ser|fer|ir|pourr|voudr|devr|saur|viendr|verr|\\p{L}+er)(?:ai|as|a|ons|ez|ont)";

const ACCENTS: Record<string, string> = {
  tres: "très", deja: "déjà", apres: "après", etre: "être", ete: "été", etait: "était", etaient: "étaient",
  etais: "étais", ecole: "école", etudiant: "étudiant", etudiants: "étudiants", etudes: "études", eleve: "élève",
  eleves: "élèves", reponse: "réponse", francais: "français", francaise: "française", garcon: "garçon",
  voila: "voilà", meme: "même", fenetre: "fenêtre", fete: "fête", tete: "tête", foret: "forêt",
  hopital: "hôpital", hotel: "hôtel", derniere: "dernière", premiere: "première", annee: "année",
  annees: "années", journee: "journée", idee: "idée", idees: "idées", musee: "musée", bientot: "bientôt",
  plutot: "plutôt", deuxieme: "deuxième", troisieme: "troisième", cinema: "cinéma", telephone: "téléphone",
  reseau: "réseau", reseaux: "réseaux", societe: "société", securite: "sécurité", activite: "activité",
  activites: "activités", universite: "université", difficulte: "difficulté", difficultes: "difficultés",
  qualite: "qualité", sante: "santé", celebre: "célèbre", general: "général", generalement: "généralement",
  prefere: "préfère", preferer: "préférer", espere: "espère", esperer: "espérer", probleme: "problème",
  problemes: "problèmes", systeme: "système", interet: "intérêt", eglise: "église", epoque: "époque",
  economique: "économique", ecologique: "écologique", energie: "énergie", age: "âge", pere: "père",
  mere: "mère", frere: "frère", soeur: "sœur", coeur: "cœur", oeuvre: "œuvre", oeuf: "œuf",
  quebec: "Québec", montreal: "Montréal", ca: "ça", deplacement: "déplacement",
  reussir: "réussir", reussi: "réussi", developper: "développer", different: "différent",
  differente: "différente", differents: "différents", necessaire: "nécessaire", benevole: "bénévole",
  benevolat: "bénévolat", experience: "expérience", experiences: "expériences", societes: "sociétés",
  reflechir: "réfléchir", eviter: "éviter", ecrire: "écrire", ecrit: "écrit", etranger: "étranger",
  equipe: "équipe", resultat: "résultat", resultats: "résultats", representer: "représenter",
  telecharger: "télécharger", television: "télévision", region: "région", periode: "période",
};

const PATTERNS: PatternRule[] = [
  {
    rule: "avoir-age-hunger", severity: "error",
    re: rx(`\\b(je suis|tu es|il est|elle est|on est|nous sommes|vous êtes|ils sont|elles sont) (faim|soif|froid|chaud|peur|sommeil|raison|tort|besoin|\\d+ ans)\\b`, "giu"),
    fix: (m) => `${({ "je suis": "j'ai", "tu es": "tu as", "il est": "il a", "elle est": "elle a", "on est": "on a", "nous sommes": "nous avons", "vous êtes": "vous avez", "ils sont": "ils ont", "elles sont": "elles ont" } as Record<string, string>)[m[1].toLowerCase()]} ${m[2]}`,
    message: "French uses « avoir » for age, hunger, thirst, cold, heat, fear, need, being right/wrong: « j'ai faim », « elle a 30 ans ».",
  },
  {
    rule: "etre-auxiliary", severity: "error",
    re: rx(`\\b(j'ai|tu as|il a|elle a|on a|nous avons|vous avez|ils ont|elles ont) (${ETRE_PARTICIPLES})\\b`, "giu"),
    fix: (m) => `${({ "j'ai": "je suis", "tu as": "tu es", "il a": "il est", "elle a": "elle est", "on a": "on est", "nous avons": "nous sommes", "vous avez": "vous êtes", "ils ont": "ils sont", "elles ont": "elles sont" } as Record<string, string>)[m[1].toLowerCase()]} ${m[2]}`,
    message: "Verbs of movement/change of state (aller, venir, arriver, partir, rester, naître, tomber, devenir, mourir…) take « être » in the passé composé, and the participle agrees with the subject.",
  },
  {
    rule: "si-conditional", severity: "error",
    re: rx(`\\bsi (je|j'|tu|il|elle|on|nous|vous|ils|elles) ?(${CONDITIONALS})\\b`, "giu"),
    message: "Never a conditional right after « si »: « si j'avais su » (not « si j'aurais su »). Use si + imparfait → conditionnel.",
  },
  {
    rule: "si-future", severity: "error",
    re: rx(`\\bsi (je|j'|tu|il|elle|on|nous|vous|ils|elles) ?(${FUTURES})\\b`, "giu"),
    message: "Never a future right after « si »: « s'il fait beau, nous irons » (si + présent → futur).",
  },
  {
    rule: "si-il", severity: "error",
    re: rx(String.raw`\bsi (ils?)\b`, "giu"),
    fix: (m) => `s'${m[1]}`,
    message: "« si » elides before « il / ils »: « s'il », « s'ils » (but « si elle », « si on »).",
  },
  {
    rule: "elision", severity: "error",
    re: rx(`\\b(je|me|te|se|le|la|de|ne|que|jusque|lorsque|puisque) ([${VOWEL}]${W}*)`, "giu"),
    fix: (m) => `${m[1].slice(0, -1)}'${m[2]}`,
    message: "Before a vowel (or a silent h), je/me/te/se/le/la/de/ne/que drop their vowel: « j'ai », « l'école », « qu'il », « n'est ».",
  },
  {
    rule: "contraction", severity: "error",
    re: rx(String.raw`\b(à le|à les|de le|de les) (?!(?:faire|voir|lire|dire|prendre|aider|rencontrer|appeler|contacter|trouver|recevoir|accueillir|inviter|écouter|attendre|convaincre|remercier|informer)\b)([\p{L}-]+)`, "giu"),
    fix: (m) => `${({ "à le": "au", "à les": "aux", "de le": "du", "de les": "des" } as Record<string, string>)[m[1].toLowerCase()]} ${m[2]}`,
    message: "Contract the article: à + le = au, à + les = aux, de + le = du, de + les = des (« je vais au marché »).",
  },
  {
    rule: "quantity-de", severity: "error",
    re: rx(String.raw`\b(beaucoup|peu|trop|assez|plus|moins|tellement|autant) (des|du|de la|de l') (?!(?:autres|gens qui|personnes qui|élèves qui|enfants qui)\b)([\p{L}-]+)`, "giu"),
    fix: (m) => `${m[1]} ${/^[aeiouyhâéèêîôû]/i.test(m[3]) ? "d'" : "de "}${m[3]}`.replace("de d'", "d'"),
    message: "After a quantity (beaucoup, peu, trop, assez, plus, moins), use « de » alone: « beaucoup de travail », « peu d'amis ».",
  },
  {
    rule: "plus-bon", severity: "error",
    re: rx(String.raw`\bplus (bon|bonne|bons|bonnes)\b`, "giu"),
    fix: (m) => ({ bon: "meilleur", bonne: "meilleure", bons: "meilleurs", bonnes: "meilleures" } as Record<string, string>)[m[1].toLowerCase()],
    message: "« plus bon » doesn't exist: use « meilleur(e)(s) ».",
  },
  {
    rule: "familiar-negation", severity: "warning",
    re: rx(String.raw`\b(je sais pas|c'est pas|il y a pas|y a pas|j'ai pas|je peux pas|je veux pas|on a pas|t'as|je suis pas)\b`, "giu"),
    message: "Dropping « ne » is spoken, familiar French. In writing, keep it: « je ne sais pas », « ce n'est pas ».",
  },
  {
    rule: "anglicism", severity: "warning",
    re: rx(String.raw`\b(supporter|appliquer pour|faire du sens|ça fait du sens|être confortable avec|actuellement)\b`, "giu"),
    message: "Possible anglicism or false friend: « supporter » = to put up with; « appliquer pour » → « postuler à »; « faire du sens » → « avoir du sens »; « actuellement » = currently (not actually → « en fait »). Check you mean it.",
  },
];

const FAMILIAR_WORDS = rx(String.raw`\b(ça|super|truc|trucs|boulot|bagnole|sympa|du coup|ouais|genre|vachement|bouquin|fringues|ok|okay)\b`, "giu");
const OPINION = rx(String.raw`\b(à mon avis|selon moi|je pense|je crois|je trouve|il me semble|pour ma part|quant à moi|personnellement|je suis (?:favorable|convaincu|d'accord|opposé)|je ne suis pas d'accord)\b`, "iu");
const PAST = rx(String.raw`\b(ai|as|a|avons|avez|ont|suis|es|est|sommes|êtes|sont) (\p{L}+(é|ée|és|ées|i|is|it|u|us|ue|ert|int))\b|\b\p{L}+(ais|ait|aient)\b`, "iu");
const GREETING = rx(String.raw`^\s*(salut|bonjour|bonsoir|cher|chère|chers|chères|coucou|madame|monsieur|allô|hello)\b`, "iu");
const CLOSING = /(bises|bisous|à bientôt|à très vite|à plus|amitiés|cordialement|salutations|je t'embrasse|je vous embrasse|bonne journée|bonne soirée|à demain|à samedi|à lundi|merci d'avance|au plaisir|veuillez agréer)/iu;
const DOC_REFERENCES = rx(String.raw`\b(document|premier|première|second|seconde|deuxième|l'auteur|l'autrice|selon (?:lui|elle|[A-ZÉ]\p{L}+)|pour [A-ZÉ]\p{L}+|d'après)\b`, "u");
const CONNECTORS = rx(String.raw`\b(d'abord|tout d'abord|ensuite|puis|enfin|de plus|en outre|par ailleurs|cependant|toutefois|néanmoins|pourtant|en revanche|par contre|au contraire|à l'inverse|alors que|tandis que|bien que|même si|malgré|certes|car|parce que|puisque|grâce à|à cause de|en effet|donc|par conséquent|c'est pourquoi|ainsi|afin de|afin que|pour que|en fait|d'une part|d'autre part|en conclusion|pour conclure|finalement|en somme|quant à|par exemple|notamment|c'est-à-dire|dans la mesure où|il n'en reste pas moins)\b`, "giu");

export function checkText(raw: string, task: TaskSpec): Issue[] {
  const text = norm(raw);
  const issues: Issue[] = [];
  const words = countWords(text);

  /* --- length: outside the range is penalised --- */
  if (words === 0) return [{ rule: "empty", severity: "error", quote: "", message: "Nothing written yet." }];
  if (words < task.min) {
    issues.push({ rule: "too-short", severity: "error", quote: "", message: `${words} words: below the minimum of ${task.min}. A text that is too short cannot show the expected level — and a task not done makes the whole paper insufficient.` });
  } else if (words > task.max) {
    issues.push({ rule: "too-long", severity: "warning", quote: "", message: `${words} words: above the maximum of ${task.max}. Respecting the range is part of doing the task; cut repetitions.` });
  }

  /* --- pattern rules --- */
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = p.re.exec(text))) {
      const quote = m[0];
      if (p.rule === "elision" && rx(String.raw`^(le|la|de) (un|une|onze|oui|uns|unes)\b`, "iu").test(quote)) continue;
      if (p.rule === "elision" && rx(String.raw`^que (oui|non)\b`, "iu").test(quote)) continue;
      const key = quote.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        rule: p.rule, severity: p.severity, quote,
        fix: p.fix ? keepCase(quote, p.fix(m)) : undefined,
        message: typeof p.message === "string" ? p.message : p.message(m),
      });
    }
  }

  /* --- missing accents on frequent words --- */
  const accentHits = new Set<string>();
  for (const m of text.matchAll(/[\p{L}-]+/gu)) {
    const w = m[0];
    const right = ACCENTS[w.toLowerCase()];
    if (!right || accentHits.has(w.toLowerCase())) continue;
    accentHits.add(w.toLowerCase());
    issues.push({ rule: "accent", severity: "error", quote: w, fix: keepCase(w, right), message: "Missing accent. Accents are part of the spelling: a missing one is counted as a mistake." });
  }

  /* --- capital after a full stop --- */
  for (const m of text.matchAll(/[.!?…] +([a-zàâéèêîôûç]\p{L}*)/gu)) {
    issues.push({ rule: "capital", severity: "error", quote: m[0].trim(), fix: m[0].trim().replace(m[1], m[1][0].toUpperCase() + m[1].slice(1)), message: "A sentence starts with a capital letter." });
    break;
  }

  /* --- very long sentences --- */
  const sentences = text.split(/(?<=[.!?…])\s+/).filter((s) => s.trim());
  const longest = sentences.reduce((a, s) => (countWords(s) > countWords(a) ? s : a), "");
  if (countWords(longest) > 40) {
    issues.push({ rule: "long-sentence", severity: "warning", quote: longest.slice(0, 80) + "…", message: `A ${countWords(longest)}-word sentence. Long sentences multiply errors; split it in two with a connector.` });
  }

  /* --- register: tu / vous mixing --- */
  const tu = (text.match(rx(String.raw`\b(tu|te|t'|toi|ton|ta|tes)\b`, "giu")) ?? []).length;
  const vous = (text.match(rx(String.raw`\b(votre|vos)\b`, "giu")) ?? []).length + (text.match(rx(String.raw`\bvous\b`, "giu")) ?? []).length;
  if (tu >= 2 && vous >= 2) {
    issues.push({ rule: "tu-vous", severity: "warning", quote: "", message: "You use both « tu » and « vous ». Choose one register for your reader and keep it from start to finish (« vous » is fine when speaking to several friends at once)." });
  }

  /* --- familiar words in tasks 2 and 3 --- */
  if (task.n > 1) {
    const fam = new Set((text.match(FAMILIAR_WORDS) ?? []).map((w) => w.toLowerCase()));
    if (fam.size) {
      issues.push({ rule: "familiar", severity: "warning", quote: [...fam].join(", "), message: "Familiar words in a text for the public. Prefer « cela », « excellent », « chose », « travail », « donc »." });
    }
  }

  /* --- paragraphs --- */
  const paragraphs = text.split(/\n\s*\n|\n/).filter((p) => p.trim()).length;
  if (words >= 80 && paragraphs < 2) {
    issues.push({ rule: "paragraphs", severity: "warning", quote: "", message: "A single block of text. Use paragraphs: one idea per paragraph makes your plan visible to the examiner." });
  }

  /* --- connectors --- */
  const connectors = new Set((text.match(CONNECTORS) ?? []).map((c) => c.toLowerCase()));
  const want = task.n === 1 ? 2 : 4;
  if (connectors.size < want) {
    issues.push({ rule: "connectors", severity: "warning", quote: [...connectors].join(", "), message: `${connectors.size} different linking word(s) found; aim for at least ${want} (d'abord, ensuite, en revanche, car, donc, cependant, c'est pourquoi…). They are what makes a text « coherent ».` });
  }

  /* --- task-specific structure --- */
  if (task.n === 1) {
    if (!GREETING.test(text)) issues.push({ rule: "t1-greeting", severity: "warning", quote: "", message: "Task 1 is a message: start with a greeting adapted to the reader (« Salut Marie, », « Bonjour à tous, », « Madame, Monsieur, »)." });
    if (!CLOSING.test(text)) issues.push({ rule: "t1-closing", severity: "warning", quote: "", message: "End the message with a closing formula (« À bientôt, », « Bises, », « Cordialement, ») and your name." });
  }
  if (task.n === 2) {
    if (!PAST.test(text)) issues.push({ rule: "t2-past", severity: "warning", quote: "", message: "Task 2 asks you to tell an experience: use past tenses (passé composé for events, imparfait for descriptions)." });
    if (!OPINION.test(text)) issues.push({ rule: "t2-opinion", severity: "warning", quote: "", message: "Task 2 also asks for your opinion: state it explicitly (« À mon avis… », « Je pense que… »)." });
  }
  if (task.n === 3) {
    if (!DOC_REFERENCES.test(text)) issues.push({ rule: "t3-documents", severity: "warning", quote: "", message: "Present BOTH documents first, naming them (« Selon le premier document… », « Pour Marc… »)." });
    if (!OPINION.test(text)) issues.push({ rule: "t3-opinion", severity: "error", quote: "", message: "Your own opinion is missing or not signposted: add a clear transition (« Pour ma part, … ») and justify it." });
    if (/«[^»]{60,}»/.test(text)) issues.push({ rule: "t3-copy", severity: "warning", quote: "", message: "Long quotation detected. Reformulate the documents in your own words instead of copying them." });
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, tip: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Keep the capital of the original word in the suggestion. */
function keepCase(original: string, fix: string): string {
  return /^\p{Lu}/u.test(original) ? fix[0].toUpperCase() + fix.slice(1) : fix;
}

/** Extra statistics shown under the editor. */
export function textStats(raw: string) {
  const text = norm(raw);
  const connectors = [...new Set((text.match(CONNECTORS) ?? []).map((c) => c.toLowerCase()))];
  return {
    words: countWords(text),
    paragraphs: text.split(/\n\s*\n|\n/).filter((p) => p.trim()).length,
    sentences: (text.match(/[^.!?…]+[.!?…]+/g) ?? []).length,
    connectors,
  };
}
