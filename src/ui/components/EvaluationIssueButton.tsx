import { useState } from 'react';
import './EvaluationIssueButton.css';

/** Sharing needs an explicit user gesture; there is no automatic upload to any server. */
export function EvaluationIssueButton({ makeReport }: { makeReport: () => string }) {
  const [feedback, setFeedback] = useState('');

  async function share() {
    setFeedback('');
    try {
      const text = makeReport();
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Compagnon Correcteur — diagnostic', text });
          setFeedback('Partage lancé.');
          return;
        } catch (cause) {
          if (cause instanceof Error && cause.name === 'AbortError') {
            setFeedback('Partage annulé.');
            return;
          }
          // Some browsers expose native share but reject it: fall back to copying.
        }
      }
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(text);
      setFeedback('Rapport copié. Colle-le dans notre conversation pour que je puisse l’analyser.');
    } catch {
      setFeedback('Partage impossible : autorise le presse-papiers ou utilise un autre navigateur.');
    }
  }

  return <span className="evaluation-issue-report">
    <button type="button" className="secondary-button" onClick={() => { void share(); }}>
      Partager le diagnostic
    </button>
    {feedback && <small role="status">{feedback}</small>}
  </span>;
}
