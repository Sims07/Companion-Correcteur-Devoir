# Catalogue des prompts IA

Les instructions destinées aux modèles sont centralisées et versionnées avec le code. Les adaptateurs restent responsables des appels réseau, des images et des paramètres de génération ; ils ne doivent pas contenir de longues règles pédagogiques.

| Responsabilité | Constructeur |
| --- | --- |
| Lecture de copie, sujet, barème, identité et annotations | `src/adapters/ai/prompts/visionPrompts.ts` |
| Correction complète basée sur le barème | `src/adapters/ai/prompts/fullGradingPrompt.ts` |
| Décisions fermées par attendu | `src/adapters/ai/decisionPrompts.ts` |
| Correction incrémentale par critère | `src/adapters/ai/gradingPrompts.ts` |
| Classification de page et analyse de schémas | `src/adapters/ai/prompts/scientificDiagramPrompts.ts` |
| Arbitrage et reprise après réponse invalide | `src/adapters/ai/prompts/repairPrompts.ts` |
| Sondage minimal de disponibilité du modèle | `src/adapters/ai/prompts/modelProbePrompt.ts` |
| Structuration et consolidation de barème | `src/adapters/ai/rubricStructuring.ts` |

Les trois constructeurs déjà spécialisés (décision, incrémental et structuration du barème) restent en place pour préserver leurs API et leurs tests existants.

## Règles d'évolution

1. Modifier le texte dans son constructeur spécialisé. Les blocs dynamiques du barème, du sujet et de la copie restent des **données non fiables** et ne doivent pas devenir des instructions.
2. Conserver les limites de taille et les séparateurs des prompts ; ils peuvent modifier la qualité de sortie et le coût des appels LLM.
3. Couvrir chaque modification par des tests unitaires de construction, puis garder les tests d'intégration du fournisseur. Une évolution pédagogique se valide aussi avec des copies de référence dans l'évaluation des modèles.
4. Ne jamais committer de copies d'étudiants, d'identifiants personnels ou de clés API comme fixtures.
5. Laisser les contraintes JSON, le streaming, la température et la gestion des erreurs dans les adaptateurs et leurs contrats existants.

## Versionnement

Cette extraction conserve volontairement le contenu exact des prompts (même ordre, mêmes chaînes et séparateurs). Leur version est actuellement liée au commit Git, ce qui suffit pour relire les évolutions et comparer les diffs. Ajouter un identifiant/version du prompt à chaque trace d'exécution pourra faire l'objet d'un lot dédié, avec compatibilité pour l'historique existant.

## Traçabilité locale des versions

Les exécutions de correction et d'évaluation conservent, pour chaque appel diagnostiqué, `promptId` et `promptVersion` à partir du registre `src/adapters/ai/prompts/promptRegistry.ts`. L'onglet technique Observabilité affiche ces informations avec le contenu réel de la requête (images masquées). Les anciens historiques sans version restent consultables et ne reçoivent **aucune version inventée**.

- Incrémenter explicitement la révision lors d'un changement de consigne ou de contrat d'un prompt.
- Les décisions natives System One utilisent les textes de questions définis dans `src/domain/systemOneDecision.ts` : ils sont suivis par l'identité `decision.system-one`. Le calcul des points reste dans le domaine.
- Le registre ne contient aucune copie ni secret. Les deux fournisseurs (Ollama local et API compatible) conservent leurs routes et paramètres.
- Les variantes de réparation conservent leur propre identifiant pour comparer leur taux d'utilisation.
