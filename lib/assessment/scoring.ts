export interface GradableQuestion {
  id: string;
  marks: number;
  correctOptionId: string | null;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedOptionId: string | null;
}

export interface GradedAnswer {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  marksAwarded: number;
}

export interface GradeResult {
  answers: GradedAnswer[];
  score: number;
  totalMarks: number;
  percentage: number;
}

/**
 * Pure, server-only grading. Never runs in the browser - the correct option
 * id is only ever loaded inside a Route Handler with the service-role client.
 */
export function gradeAttempt(
  questions: GradableQuestion[],
  submitted: SubmittedAnswer[]
): GradeResult {
  const submittedByQuestion = new Map(submitted.map((a) => [a.questionId, a]));

  let score = 0;
  let totalMarks = 0;

  const answers: GradedAnswer[] = questions.map((q) => {
    totalMarks += q.marks;
    const answer = submittedByQuestion.get(q.id);
    const isCorrect = Boolean(
      answer?.selectedOptionId && q.correctOptionId && answer.selectedOptionId === q.correctOptionId
    );
    const marksAwarded = isCorrect ? q.marks : 0;
    score += marksAwarded;

    return {
      questionId: q.id,
      selectedOptionId: answer?.selectedOptionId ?? null,
      isCorrect,
      marksAwarded,
    };
  });

  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0;

  return { answers, score, totalMarks, percentage };
}
