import { useRef, useState, type KeyboardEvent } from 'react';
import {
  radarMethodGuideEntries, type MethodGuideEntry,
} from '../../domain/radarMethodGuideCatalog.ts';
import type { RadarMethodDomain } from '../../domain/radarMethodExclusions.ts';
import { DesignSystemSelect } from '../../../shared/ui/components/DesignSystemSelect.tsx';
import {
  RADAR_METHOD_STATUS_GROUPS, loadRadarMethodStatuses, radarMethodStatus,
  saveRadarMethodStatuses, updateRadarMethodStatus, type RadarMethodStatus,
} from '../../domain/radarMethodStatuses.ts';
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

/** Research-status groupings are deliberately independent from excluded radar data.
 * Any method can be inspected and reclassified without changing its test history. */
export function RadarMethodGuide({ domain }: { domain: RadarMethodDomain }) {
  const entries = radarMethodGuideEntries(domain);
  const [statuses, setStatuses] = useState(loadRadarMethodStatuses);
  const [selectedId, setSelectedId] = useState(() => entries[0]?.id ?? '');
  const [saveNotice, setSaveNotice] = useState('');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const grouped = RADAR_METHOD_STATUS_GROUPS.map(group => ({
    ...group,
    entries: entries.filter(entry => radarMethodStatus(statuses, domain, entry.id) === group.id),
  }));
  const ordered = grouped.flatMap(group => group.entries);
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0];
  const selectedStatus = selected && radarMethodStatus(statuses, domain, selected.id);

  function handleTabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % ordered.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + ordered.length - 1) % ordered.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ordered.length - 1;
    else return;
    event.preventDefault();
    const item = ordered[next];
    if (!item) return;
    setSelectedId(item.id);
    tabRefs.current[item.id]?.focus();
  }

  function changeStatus(status: RadarMethodStatus) {
    if (!selected) return;
    const updated = updateRadarMethodStatus(statuses, domain, selected.id, status);
    const stored = saveRadarMethodStatuses(updated);
    setStatuses(updated);
    setSaveNotice(stored
      ? 'Classement enregistré sur cet appareil.'
      : 'Classement modifié pour cette session, mais la sauvegarde locale a échoué.');
  }

  return <section className="lab-method-science-guide lab-guide" id="method-science-guide"
    aria-label="Fiches scientifiques des méthodes">
    <header className="lab-guide-heading">
      <div>
        <span className="lab-guide-overline">LABORATOIRE · COMPRENDRE</span>
        <h3>Comprendre les méthodes</h3>
        <p>Retrouvez les parcours de correction directe image + barème → LLM et les stratégies d’observation des graphes. « Comparer Think OFF / ON » déclenche deux parcours, ce n’est pas une méthode supplémentaire.</p>
        <p className="lab-guide-intro">Classement de suivi modifiable, indépendant des notes et des exclusions des radars. Les méthodes mises de côté restent consultables.</p>
      </div>
    </header>
    <div className="lab-guide-groups" role="tablist" aria-label="Méthodes expliquées">
      {grouped.map(group => <div className="lab-guide-group" role="group"
        aria-label={group.label} data-status-group={group.id} key={group.id}>
        <div className="lab-guide-group-heading">
          <h4>{group.label} <span className="lab-guide-group-count">{group.entries.length}</span></h4>
          <p>{group.description}</p>
        </div>
        {group.entries.length > 0 ? <div className="lab-guide-tabs">
          {group.entries.map(entry => <button
            key={entry.id} ref={element => { tabRefs.current[entry.id] = element; }}
            id={'lab-guide-tab-' + entry.id}
            type="button" role="tab" aria-controls="lab-guide-panel"
            aria-selected={selected?.id === entry.id}
            tabIndex={selected?.id === entry.id ? 0 : -1}
            className="lab-guide-tab" data-method-id={entry.id}
            onClick={() => { setSelectedId(entry.id); setSaveNotice(''); }}
            onKeyDown={event => handleTabKeys(event, ordered.findIndex(item => item.id === entry.id))}>
            <RadarMethodThumbnail kind={entry.illustration}/>
            <span className="lab-guide-tab-copy">
              <strong>{entry.label}</strong>
              <small>{entry.summary}</small>
            </span>
            <span className="lab-guide-tab-check" aria-hidden="true">{selected?.id === entry.id ? '✓' : ''}</span>
          </button>)}
        </div> : <p className="lab-guide-empty">Aucune méthode dans ce groupe.</p>}
      </div>)}
    </div>
    {selected && <div className="lab-guide-panel" id="lab-guide-panel" role="tabpanel"
      aria-labelledby={'lab-guide-tab-' + selected.id} data-selected-method={selected.id}>
      <div className="lab-guide-classification">
        <div>
          <strong>Suivi de la méthode sélectionnée</strong>
          <p>Déplacez-la dans un groupe pour retrouver facilement vos pistes de recherche.</p>
        </div>
        <label htmlFor="lab-guide-status">Classement
          <DesignSystemSelect id="lab-guide-status" value={selectedStatus}
            onChange={event => changeStatus(event.currentTarget.value as RadarMethodStatus)}>
            {RADAR_METHOD_STATUS_GROUPS.map(group =>
              <option key={group.id} value={group.id}>{group.label}</option>)}
          </DesignSystemSelect>
        </label>
        {saveNotice && <p className="lab-guide-save-status" role="status">{saveNotice}</p>}
      </div>
      <MethodScientificDetails entry={selected}/>
    </div>}
    {domain === 'diagrams' && <p className="lab-guide-disclaimer">
      La correction directe reçoit l’image et le barème dans un même modèle multimodal. Les détecteurs #438 et #439 apportent
      seulement des indices à la lecture du graphe ; la batterie Relations est indépendante et ne fait pas partie de la chaîne de notation directe.
    </p>}
  </section>;
}
