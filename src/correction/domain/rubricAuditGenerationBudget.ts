/** Token budgets for a single local Ollama rubric audit.
 * Thinking consumes generation tokens before the final JSON can be written.
 * Keep the non-thinking path lightweight for small local machines.
 */
export function rubricAuditTokenBudget(thinking: boolean) {
  return thinking
    ? { num_predict: 16384, num_ctx: 24576 }
    : { num_predict: 3584 };
}
