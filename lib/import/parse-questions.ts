import Papa from "papaparse";
import type { Difficulty } from "@/types/database";
import type { ImportRow } from "@/lib/actions/questions";

export interface ParseResult {
  rows: ImportRow[];
  errors: string[];
}

const OPTION_KEYS = ["option1", "option2", "option3", "option4", "option5", "option6"];
const OPTION_LETTER_KEYS = ["optiona", "optionb", "optionc", "optiond", "optione", "optionf"];

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function resolveDifficulty(value: unknown): Difficulty {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "easy" || v === "hard" ? v : "medium";
}

function resolveCorrectIndex(rawAnswer: unknown, options: string[]): number {
  const answer = String(rawAnswer ?? "").trim();
  if (!answer) return -1;

  const asNumber = Number(answer);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) return asNumber - 1;

  const letterIndex = "abcdef".indexOf(answer.toLowerCase());
  if (letterIndex !== -1 && letterIndex < options.length) return letterIndex;

  const textIndex = options.findIndex((opt) => opt.trim().toLowerCase() === answer.toLowerCase());
  return textIndex;
}

function rowFromRecord(record: Record<string, unknown>, rowNumber: number, errors: string[]): ImportRow | null {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) normalized[normalizeKey(key)] = value;

  const text = String(normalized.question ?? normalized.text ?? "").trim();
  if (!text) {
    errors.push(`Row ${rowNumber}: missing question text.`);
    return null;
  }

  const options = [...OPTION_KEYS, ...OPTION_LETTER_KEYS]
    .map((key) => normalized[key])
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());

  if (options.length < 2) {
    errors.push(`Row ${rowNumber} ("${text.slice(0, 40)}"): needs at least 2 options.`);
    return null;
  }

  const correctIndex = resolveCorrectIndex(normalized.correct ?? normalized.answer, options);
  if (correctIndex === -1) {
    errors.push(`Row ${rowNumber} ("${text.slice(0, 40)}"): correct answer doesn't match any option.`);
    return null;
  }

  const marksValue = Number(normalized.marks);

  return {
    text,
    categoryName: normalized.category ? String(normalized.category).trim() || null : null,
    difficulty: resolveDifficulty(normalized.difficulty),
    marks: Number.isFinite(marksValue) && marksValue > 0 ? marksValue : 1,
    options,
    correctIndex,
  };
}

export function parseQuestionsCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, { header: true, skipEmptyLines: true });
  const errors: string[] = parsed.errors.map((e) => `Row ${e.row ?? "?"}: ${e.message}`);
  const rows: ImportRow[] = [];

  parsed.data.forEach((record, i) => {
    const row = rowFromRecord(record, i + 2, errors); // +2: header row + 1-based
    if (row) rows.push(row);
  });

  return { rows, errors };
}

export function parseQuestionsJson(jsonText: string): ParseResult {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { rows: [], errors: ["File is not valid JSON."] };
  }

  const list = Array.isArray(raw) ? raw : [raw];
  const rows: ImportRow[] = [];

  list.forEach((item, i) => {
    if (typeof item !== "object" || item === null) {
      errors.push(`Item ${i + 1}: not an object.`);
      return;
    }
    const record = item as Record<string, unknown>;
    const text = String(record.text ?? record.question ?? "").trim();
    const options = Array.isArray(record.options)
      ? record.options.map((o) => String(o).trim()).filter(Boolean)
      : [];

    if (!text) {
      errors.push(`Item ${i + 1}: missing "text".`);
      return;
    }
    if (options.length < 2) {
      errors.push(`Item ${i + 1} ("${text.slice(0, 40)}"): needs at least 2 options.`);
      return;
    }

    let correctIndex = -1;
    if (typeof record.correctIndex === "number") correctIndex = record.correctIndex;
    else correctIndex = resolveCorrectIndex(record.correctAnswer ?? record.answer, options);

    if (correctIndex < 0 || correctIndex >= options.length) {
      errors.push(`Item ${i + 1} ("${text.slice(0, 40)}"): correct answer doesn't match any option.`);
      return;
    }

    const marksValue = Number(record.marks);

    rows.push({
      text,
      categoryName: record.category ? String(record.category).trim() || null : null,
      difficulty: resolveDifficulty(record.difficulty),
      marks: Number.isFinite(marksValue) && marksValue > 0 ? marksValue : 1,
      options,
      correctIndex,
    });
  });

  return { rows, errors };
}
