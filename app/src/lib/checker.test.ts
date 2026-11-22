import { describe, expect, it } from "vitest";
import { checkText, type TaskSpec } from "./checker";

const T1: TaskSpec = { n: 1, min: 60, max: 120 };
const T3: TaskSpec = { n: 3, min: 120, max: 180 };
const rules = (text: string, task = T1) => checkText(text, task).map((i) => i.rule);
const has = (text: string, rule: string, task = T1) => rules(text, task).includes(rule);

describe("local writing checker", () => {
  it("flags être/avoir confusions", () => {
    expect(has("Je suis faim et elle est 30 ans.", "avoir-age-hunger")).toBe(true);
    expect(has("Hier, j'ai allé au cinéma.", "etre-auxiliary")).toBe(true);
    expect(checkText("Hier, j'ai allé au cinéma.", T1).find((i) => i.rule === "etre-auxiliary")?.fix).toBe("je suis allé");
    expect(has("Il a sorti la poubelle et elle est arrivée.", "etre-auxiliary")).toBe(false);
  });

  it("flags conditional or future after si, but not imparfait", () => {
    expect(has("Si j'aurais su, je serais venu.", "si-conditional")).toBe(true);
    expect(has("Si tu viendras, on mangera.", "si-future")).toBe(true);
    expect(has("Si j'avais su, je serais venu.", "si-conditional")).toBe(false);
    expect(has("Si je préparais le repas, tu serais content.", "si-conditional")).toBe(false);
    expect(has("Si il pleut, je reste.", "si-il")).toBe(true);
  });

  it("flags missing elision but respects exceptions", () => {
    expect(has("Je aime le hiver et que il vienne.", "elision")).toBe(true);
    expect(has("Le onze mai, le yaourt, la une du journal, le héros.", "elision")).toBe(false);
  });

  it("flags contractions and quantities", () => {
    expect(has("Je vais à le marché.", "contraction")).toBe(true);
    expect(has("Je suis content de les voir.", "contraction")).toBe(false);
    expect(checkText("J'ai beaucoup des amis.", T1).find((i) => i.rule === "quantity-de")?.fix).toBe("beaucoup d'amis");
  });

  it("flags missing accents with the corrected word", () => {
    const issue = checkText("C'est tres important pour mon ecole.", T1).filter((i) => i.rule === "accent");
    expect(issue.map((i) => i.fix)).toEqual(["très", "école"]);
  });

  it("checks length and task structure", () => {
    expect(has("Bonjour.", "too-short")).toBe(true);
    const longNoGreeting = Array(70).fill("mot").join(" ");
    expect(has(longNoGreeting, "t1-greeting")).toBe(true);
    expect(has(longNoGreeting, "t3-opinion", T3)).toBe(true);
  });

  it("gives no error on a correct model text", () => {
    const model = `Salut Camille,

Ça y est, j'ai emménagé ! Je suis installée à Lyon depuis samedi dernier et je commence
enfin à me repérer.

Le quartier me plaît beaucoup : il y a un marché le mercredi, une boulangerie au coin de
la rue et un grand parc à cinq minutes à pied. En revanche, c'est assez bruyant le soir,
et mes anciens voisins me manquent un peu.

Est-ce que tu voudrais venir passer un week-end ici ? Je peux te loger sans problème et je
te ferai visiter la vieille ville. Dis-moi quelles dates t'arrangent en septembre.

À très vite,
Léa`;
    const errors = checkText(model, T1).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
});
