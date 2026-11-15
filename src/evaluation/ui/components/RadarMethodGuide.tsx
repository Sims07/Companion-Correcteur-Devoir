import { useRef, useState, type KeyboardEvent } from 'react';
import {
  radarMethodGuideEntries, type MethodGuideEntry,
} from '../../domain/radarMethodGuideCatalog.ts';
import type { RadarMethodDomain } from '../../domain/radarMethodExclusions.ts';
import { RadarMethodIllustration, RadarMethodThumbnail } from './RadarMethodIllustration.tsx';
import './RadarMethodGuide.css';

function MethodScientificDetails({ entry }: { entry: MethodGuideEntry }) {
  const { science } = entry;
  return <div className="lab-guide-detail-layout">
    <div className="lab-guide-text">
      <span className="lab-guide-kicker">Fiche de méthode · {entry.label}</span>
      <h4>{entry.title}</h4>
      <section className="lab-guide-principle" aria-label="Principe scientifique">
        <h5>Principe scientifique</h5>
        <p>{science.principle}</p>
      </section>
      <section aria-label="Étapes de l'algorithme">
        <h5>Étapes de l’algorithme ou du protocole</h5>
        <ol className="lab-guide-steps">{science.steps.map((step, i) =>
          <li key={i}><span aria-hidden="true">{i + 1}</span><p>{step}</p></li>)}</ol>
      </section>
      <div className="lab-guide-benefits">
        <section className="lab-guide-benefit" aria-label="Intérêt"><h5>Intérêt</h5><p>{science.interest}</p></section>
        <section className="lab-guide-limit" aria-label="Limites et risques d’erreur"><h5>Limites et risques d’erreur</h5><p>{science.limitations}</p></section>
      </div>
      <section className="lab-guide-scope" aria-label="Ce qui est réellement testé">
        <h5>Ce qui est réellement testé</h5>
        <p>{science.radarScope}</p>
      </section>
    </div>
    <figure className="lab-guide-figure">
      <div className="lab-guide-figure-title">
        <span className="lab-guide-figure-symbol" aria-hidden="true">◎</span>
        <div><h5>{entry.visualFocus}</h5><p>Illustration pédagogique du fonctionnement de la méthode</p></div>
      </div>
      <RadarMethodIllustration kind={entry.illustration}/>
      <figcaption>{entry.visualCaption}</figcaption>
      <p className="lab-guide-figure-note">Schéma simplifié, non issu d’une copie ni d’un résultat de test.</p>
    </figure>
  </div>;
}

/** One single full-width detail panel below a selectable row of illustrated
 * method cards. All methods stay readable even when excluded from new tests. */
export function RadarMethodGuide({ domain }: { domain: RadarMethodDomain }) {
  const entries = radarMethodGuideEntries(domain);
  const [selectedId, setSelectedId] = useState(() => entries[0]?.id ?? '');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0];

  function handleTabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % entries.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + entries.length - 1) % entries.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = entries.length - 1;
    else return;
    event.preventDefault();
    const item = entries[next];
    if (!item) return;
    setSelectedId(item.id);
    tabRefs.current[next]?.focus();
  }

  return <section className="lab-method-science-guide lab-guide" id="method-science-guide"
    aria-label="Fiches scientifiques des méthodes">
    <header className="lab-guide-heading">
      <div>
        <span className="lab-guide-overline">LABORATOIRE · COMPRENDRE</span>
        <h3>Comprendre les méthodes</h3>
        <p>Retrouvez les parcours de correction directe image + barème → LLM et les stratégies d’observation des graphes. « Comparer Think OFF / ON » déclenche deux parcours, ce n’est pas une méthode supplémentaire.</p>
      </div>
    </header>
    <div className="lab-guide-tabs" role="tablist" aria-label="Méthodes expliquées">
      {entries.map((entry, index) => <button
        key={entry.id} ref={element => { tabRefs.current[index] = element; }}
        id={'lab-guide-tab-' + entry.id}
        type="button" role="tab" aria-controls="lab-guide-panel"
        aria-selected={selected?.id === entry.id}
        tabIndex={selected?.id === entry.id ? 0 : -1}
        className="lab-guide-tab" data-method-id={entry.id}
        onClick={() => setSelectedId(entry.id)}
        onKeyDown={event => handleTabKeys(event, index)}>
        <RadarMethodThumbnail kind={entry.illustration}/>
        <span className="lab-guide-tab-copy">
          <strong>{entry.label}</strong>
          <small>{entry.summary}</small>
        </span>
        <span className="lab-guide-tab-check" aria-hidden="true">{selected?.id === entry.id ? '✓' : ''}</span>
      </button>)}
    </div>
    {selected && <div className="lab-guide-panel" id="lab-guide-panel" role="tabpanel"
      aria-labelledby={'lab-guide-tab-' + selected.id} data-selected-method={selected.id}>
      <MethodScientificDetails entry={selected}/>
    </div>}
    {domain === 'diagrams' && <p className="lab-guide-disclaimer">
      La correction directe reçoit l’image et le barème dans un même modèle multimodal. Les détecteurs #438 et #439 apportent
      seulement des indices à la lecture du graphe ; la batterie Relations est indépendante et ne fait pas partie de la chaîne de notation directe.
    </p>}
  </section>;
}
