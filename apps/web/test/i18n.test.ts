import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ar from '../messages/ar.json';
import en from '../messages/en.json';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`)));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

const DECL = /const (\w+) = (?:await )?(?:useTranslations|getTranslations)\('([^']+)'\)/g;

/**
 * Statically visible translation keys: `const t = useTranslations('ns')` followed by t('key') or
 * t(`prefix.${x}`). The nearest preceding declaration of a variable name decides its namespace.
 */
function usedKeys(): { exact: Map<string, string>; prefixes: Map<string, string> } {
  const exact = new Map<string, string>();
  const prefixes = new Map<string, string>();
  for (const file of walk(path.join(__dirname, '..', 'src'))) {
    const src = readFileSync(file, 'utf8');
    const decls = [...src.matchAll(DECL)].map((m) => ({ v: m[1]!, ns: m[2]!, at: m.index ?? 0 }));
    const nsAt = (v: string, pos: number): string | undefined => decls.filter((d) => d.v === v && d.at < pos).at(-1)?.ns;
    for (const v of new Set(decls.map((d) => d.v))) {
      const exactRe = new RegExp(`\\b${v}(?:\\.has)?\\(\\s*'([^']+)'`, 'g');
      for (const m of src.matchAll(exactRe)) {
        const ns = nsAt(v, m.index ?? 0);
        if (ns) exact.set(`${ns}.${m[1]}`, file);
      }
      const dynRe = new RegExp('\\b' + v + '(?:\\.has)?\\(\\s*`([^$`]+)\\$\\{', 'g');
      for (const m of src.matchAll(dynRe)) {
        const ns = nsAt(v, m.index ?? 0);
        if (ns) prefixes.set(`${ns}.${m[1]}`, file);
      }
    }
  }
  return { exact, prefixes };
}

describe('i18n catalogues', () => {
  const arKeys = new Set(flatten(ar as Tree));
  const enKeys = new Set(flatten(en as Tree));

  it('Arabic and English have exactly the same keys', () => {
    expect([...arKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !arKeys.has(k))).toEqual([]);
  });

  it('every statically referenced key exists', () => {
    const { exact, prefixes } = usedKeys();
    const missing = [...exact.keys()].filter((k) => !arKeys.has(k));
    const missingPrefix = [...prefixes.keys()].filter((p) => ![...arKeys].some((k) => k.startsWith(p)));
    expect({ missing, missingPrefix }).toEqual({ missing: [], missingPrefix: [] });
  });

  it('no empty strings', () => {
    const empty = (tree: Tree, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? (v.trim() ? [] : [`${prefix}${k}`]) : empty(v, `${prefix}${k}.`)));
    expect([...empty(ar as Tree), ...empty(en as Tree)]).toEqual([]);
  });

  it('Arabic strings contain Arabic text', () => {
    const arabic = /[؀-ۿ]/;
    const bad = [...arKeys].filter((k) => {
      const v = k.split('.').reduce<unknown>((acc, p) => (acc as Tree)[p], ar) as string;
      const text = v.replace(/\{[^}]*\}/g, '');
      return !arabic.test(text) && text.length > 8 && /[A-Za-z]{3,}/.test(text);
    });
    expect(bad).toEqual([]);
  });
});
