import type { RuntimeOption, RuntimeQuestion } from "@/types/domain";

/**
 * Fisher-Yates shuffle. The old HTML used `sort(() => Math.random() - 0.5)`,
 * which is a well-known biased shuffle - this is the correct replacement.
 */
export function shuffleArray<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function shuffleQuestions(
  questions: RuntimeQuestion[],
  { randomizeQuestions, randomizeOptions }: { randomizeQuestions: boolean; randomizeOptions: boolean }
): RuntimeQuestion[] {
  const ordered = randomizeQuestions ? shuffleArray(questions) : questions;

  if (!randomizeOptions) return ordered;

  return ordered.map((q) => ({
    ...q,
    options: shuffleArray<RuntimeOption>(q.options),
  }));
}
