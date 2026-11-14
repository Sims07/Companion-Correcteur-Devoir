import type { RadarBatteryExecution } from '../../domain/radarBatteryExecution.ts';

export function RadarBatteryContext({ execution }: { execution: RadarBatteryExecution }) {
  return <div className="evaluation-radar-method-context" role="group" aria-label="Méthode et moteur du test radar">
    <span>Stratégie choisie : <strong>{execution.selectedMethod}</strong></span>
    <span>Batterie {execution.batteryIndex}/{execution.batteryTotal} : <strong>{execution.batteryLabel}</strong></span>
    <span>Moteur utilisé : <strong>{execution.engineLabel}</strong></span>
  </div>;
}
