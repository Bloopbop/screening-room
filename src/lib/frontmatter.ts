import { load, CORE_SCHEMA } from 'js-yaml';

export interface Page {
  data: Record<string, unknown>;
  body: string;
}

const FENCE = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

/**
 * Splits a Markdown page into its YAML frontmatter and body. The core schema
 * keeps dates as written ("2026-11-24", not a Date). A page whose frontmatter
 * won't parse as YAML still gives up its simple "key: value" lines.
 */
export function readPage(text: string): Page {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = FENCE.exec(normalized);
  if (!match) return { data: {}, body: normalized };
  const body = normalized.slice(match[0].length);
  try {
    const data = load(match[1], { schema: CORE_SCHEMA });
    if (data && typeof data === 'object' && !Array.isArray(data)) return { data: data as Record<string, unknown>, body };
    return { data: {}, body };
  } catch {
    return { data: looseYaml(match[1]), body };
  }
}

function looseYaml(yaml: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const line of yaml.split('\n')) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].replace(/\s+#.*$/, '').trim();
    if (/^\[.*\]$/.test(value)) {
      data[m[1]] = value.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean);
      continue;
    }
    value = unquote(value);
    data[m[1]] = value;
  }
  return data;
}

function unquote(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) return value.slice(1, -1);
  return value;
}

/** A frontmatter value as text: numbers and dates as written, lists joined. */
export function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  return '';
}

export function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single ? single.split(',').map((v) => v.trim()).filter(Boolean) : [];
}

/** A number, or null for "—", blanks and anything else. */
export function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

export function flag(value: unknown): boolean {
  return value === true || value === 'true' || value === 'yes';
}

/** A YAML double-quoted string: JSON's escapes are valid YAML. */
export function quoted(value: string): string {
  return JSON.stringify(value);
}
