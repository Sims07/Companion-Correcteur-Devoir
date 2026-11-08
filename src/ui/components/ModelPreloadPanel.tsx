import { useEffect, useRef, useState } from 'react';
import { Button, StatusNotice, TextInput } from '../design-system/index.ts';

interface ModelPreloadPanelProps {
  endpoint: string;
  apiKey: string;
  busy: boolean;
  loadModel: (settings: { endpoint: string; apiKey: string; model: string }) => Promise<void>;
}

export function ModelPreloadPanel({ endpoint, apiKey, busy, loadModel }: ModelPreloadPanelProps) {
  const [modelName, setModelName] = useState('saluki-27b');
  const [loading, setLoading] = useState(false);
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);
  const requestId = useRef(0);
  const selectedName = modelName.trim();

  useEffect(() => {
    // A successful preload on another server/token is not proof of availability here.
    requestId.current += 1;
    setLoading(false);
    setLoadedName(null);
    setFeedback(null);
  }, [endpoint, apiKey]);

  async function preload() {
    if (loading || busy || !selectedName) return;
    const name = selectedName;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setFeedback(null);
    try {
      await loadModel({ endpoint, apiKey, model: name });
      if (currentRequest !== requestId.current) return;
      setLoadedName(name);
      setFeedback({ tone: 'success', message: `Le serveur a confirmé le chargement de « ${name} ».` });
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      setLoadedName(null);
      setFeedback({
        tone: 'warning',
        message: cause instanceof Error ? cause.message : `Le préchargement de « ${name} » a échoué.`,
      });
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  return (
    <section className="model-preload-card" aria-labelledby="model-preload-title">
      <div className="model-preload-heading">
        <div><p className="eyebrow">MODÈLES · À LA DEMANDE</p><h3 id="model-preload-title">Précharger un modèle</h3></div>
        <span className={loadedName === selectedName && selectedName ? 'model-preload-status is-loaded' : 'model-preload-status'}>
          {loadedName === selectedName && selectedName ? 'Chargé' : 'Non chargé'}
        </span>
      </div>
      <p>Choisissez le modèle à charger sur ce serveur. Le préchargement ne modifie pas vos modèles de lecture ou d’analyse.</p>
      <label className="field-label" htmlFor="model-preload-name">Nom du modèle à précharger</label>
      <TextInput id="model-preload-name" value={modelName} disabled={loading || busy} placeholder="Ex. saluki-27b, qwen3.5:27b" aria-describedby="model-preload-hint"
        onChange={(event) => { setModelName(event.target.value); setLoadedName(null); setFeedback(null); }} />
      <p className="hint" id="model-preload-hint">Saisissez l’identifiant exact reconnu par votre serveur, indépendamment des modèles utilisés pour la correction.</p>
      <Button variant="primary" className="full-button" disabled={busy || loading || !selectedName} onClick={() => void preload()}>
        {loading ? 'Préchargement en cours…' : loadedName === selectedName && selectedName ? 'Recharger ce modèle' : 'Précharger ce modèle'}
      </Button>
      {feedback && <StatusNotice tone={feedback.tone}>{feedback.message}</StatusNotice>}
      <p className="hint">Le serveur peut décharger d’autres modèles pour libérer la mémoire. Cette action nécessite une API proposant le chargement à la demande.</p>
      <details>
        <summary>Détails techniques</summary>
        <p>POST <code>/v1/models/{selectedName ? encodeURIComponent(selectedName) : '{nom-du-modèle}'}/load</code></p>
        <p>Le token Bearer configuré est transmis au serveur. Selon le serveur, il doit disposer du périmètre <code>models</code>. Cet endpoint n’est pas standard dans toutes les API compatibles OpenAI.</p>
      </details>
    </section>
  );
}
