import type { GradingProposal } from '../domain/grading.ts';

/** A local fact about one model response. No image, raw response or transcript. */
export type GradingOutcome =
  | { readonly type: 'correction.proposal-produced'; readonly proposal: GradingProposal }
  | { readonly type: 'correction.response-ungradable' };
