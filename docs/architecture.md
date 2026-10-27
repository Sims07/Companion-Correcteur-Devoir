# Architecture — Companion Correcteur Devoir

## Stack et structure

Le projet suit la stack d'Enterprise Capacity Mapper : React, TypeScript, Vite et Vitest. La logique métier est isolée des composants React et des adaptateurs techniques.

- `src/domain/` : contrats et règles métier pures (barèmes, critères, suggestions de correction).
- `src/application/` : orchestration des cas d'usage.
- `src/ports/` : interfaces typées des fournisseurs IA et du traitement documentaire.
- `src/adapters/ai/` : adaptateurs de fournisseurs, en commençant par Ollama.
- `src/components/` : interface React.
- `tests/` : tests unitaires reproductibles sans réseau ni modèle local.

## Flux cible

1. L'enseignant importe les photos localement et choisit un barème.
2. Un traitement local prépare les pages et, si disponible, extrait le texte via OCR.
3. Un modèle vision local ou un pipeline OCR/LLM propose une évaluation critère par critère.
4. Chaque proposition contient les éléments de preuve, les points proposés et un niveau d'incertitude.
5. Les réponses incertaines déclenchent une question ou une demande de revue.
6. L'enseignant confirme ou modifie les propositions avant toute note finale.

## Confidentialité

- Aucun appel cloud n'est implémenté dans cette fondation.
- Le futur adaptateur Ollama utilise une URL locale configurable, par défaut `http://localhost:11434`.
- Pas de repli automatique vers le cloud si Ollama est indisponible.
- Les images, OCR, prompts et corrections ne doivent pas être envoyés à un service distant par défaut.
- Les résultats générés restent des suggestions non fiables tant que l'enseignant ne les a pas validés.

## État de cette fondation

L'interface affiche un premier écran de cadrage et vérifie localement la cohérence d'un barème. Les images, l'OCR, le stockage des copies et l'appel Ollama seront implémentés dans des PR dédiées.
