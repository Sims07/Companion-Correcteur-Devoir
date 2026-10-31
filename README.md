# Companion Correcteur Devoir

[![Tests](https://github.com/Sims07/Companion-Correcteur-Devoir/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Sims07/Companion-Correcteur-Devoir/actions/workflows/tests.yml)
[![Couverture unitaire](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FSims07%2FCompanion-Correcteur-Devoir%2Fmain%2Fbadges%2Fcoverage.json)](https://github.com/Sims07/Companion-Correcteur-Devoir/actions/workflows/tests.yml)

Application React + TypeScript pour aider les enseignants en biologie à corriger des copies manuscrites à partir d'un barème. Le professeur garde la décision finale ; l'application privilégie un traitement local via Ollama.

## Stack

- React + TypeScript + Vite
- Vitest pour les tests unitaires et d'intégration
- Playwright pour les parcours navigateur
- PDF.js pour convertir les pages PDF en images dans le navigateur
- Ollama comme fournisseur IA configurable
- IndexedDB pour archiver localement des corrections et conserver les retours de l'enseignant

## Démarrage

```bash
npm install
npm run dev
```

Vérifications utilisées par la CI :

```bash
npm run typecheck
npm test
npm run test:coverage
npm run test:coverage:core
npm run build
npm run test:e2e
```

## Couverture et tests

- `npm test` exécute les tests Vitest unitaires et d'intégration.
- `npm run test:coverage` mesure la couverture du code TypeScript inclus dans la configuration Vitest et produit un rapport dans `coverage-unit/`.
- `npm run test:coverage:core` produit un rapport ciblé sur le domaine et les cas d'usage dans `coverage-unit-core/`.
- `npm run test:e2e` exécute les parcours Playwright dans Chromium.
- Les contrats TypeScript sans comportement exécutable ne constituent pas une cible utile de couverture. La couverture ne remplace ni les tests de parcours ni l'évaluation de la qualité pédagogique des corrections.

Les seuils de couverture ne sont pas encore bloquants. Le badge de couverture est recalculé par la CI sur les pushes vers `main` ; les pull requests n'ont pas à le modifier manuellement.

## Parcours de correction

1. **Préparer le devoir.** Modifiez le barème ou importez-en un depuis un fichier pris en charge. Pour un barème photographié, le modèle de vision d'Ollama extrait une structure JSON que l'enseignant peut vérifier et ajuster. Les documents texte sont importés localement.
2. **Choisir le format.** Les questions peuvent être intégrées aux copies, ou un sujet de référence peut être fourni séparément. Dans ce second mode, la transcription du sujet est réutilisée pendant la session.
3. **Configurer les modèles.** Configurez l'URL d'Ollama (par défaut `http://localhost:11434`), testez la connexion et choisissez séparément le modèle de lecture (vision) et le modèle d'analyse/notation. Un même modèle peut remplir les deux rôles, mais la lecture d'images nécessite un modèle de vision.
4. **Lire puis analyser.** La lecture des images et l'analyse du barème sont deux étapes distinctes. La transcription obtenue reste consultable ; une nouvelle analyse peut réutiliser le texte déjà extrait sans relire les images. Le flux affiche l'avancement des étapes et leurs durées dans les diagnostics disponibles.
5. **Réviser les propositions.** L'espace de révision maintient la copie originale à côté des critères, des justifications, des éléments de preuve et des niveaux de confiance. La transcription est consultable dans le panneau de référence. Une confiance faible ou un signal de lecture incertaine appelle une vérification ; le professeur ajuste les notes et commentaires.
6. **Finaliser et retrouver une correction.** Les corrections finalisées peuvent être enregistrées dans le stockage local du navigateur, puis rouvertes pour consultation. Le professeur peut continuer avec une autre copie du devoir ou préparer un devoir distinct.
7. **Améliorer les corrections suivantes.** Les décisions et commentaires de l'enseignant sont conservés localement et peuvent alimenter un contexte de rappel léger, associé à la correction et/ou à l'empreinte exacte du barème. Ce mécanisme de recherche locale n'entraîne pas le modèle et ne remplace jamais le barème courant.
8. **Comparer les modèles (diagnostic).** Le mode Diagnostic IA permet d'examiner les sorties et les notes globales/par critère, les durées et les stratégies de comparaison disponibles, y compris un arbitre expérimental. Ces options de diagnostic ne sont pas activées par défaut dans le parcours normal de correction enseignant.

## Confidentialité et limites

- Les photos et PDF sont préparés dans le navigateur ; les PDF sont rendus en images localement. Aucun fichier n'est téléversé vers un service de stockage cloud par défaut.
- Le parcours courant de lecture et de correction textuelle utilise l'endpoint Ollama explicitement configuré. Il n'y a pas de basculement silencieux vers un fournisseur cloud.
- À chaque correction, le modèle Vision classe d'abord les pages de la copie : réponse rédigée, schéma scientifique ou page ambiguë. Seules les pages identifiées comme schémas sont ensuite envoyées à la correction scientifique spécialisée ; les pages ambiguës restent dans le parcours textuel et sont signalées au professeur. Les deux parcours restent séparés et les propositions graphiques ne sont pas ajoutées automatiquement au total.
- **Vérifiez l'endpoint Ollama avant d'importer des copies.** Si vous le configurez sur une machine distante, les données envoyées à cet endpoint quittent l'appareil. Pour un usage strictement local, utilisez un serveur Ollama local que vous contrôlez.
- Selon le navigateur et la configuration réseau, Ollama peut nécessiter une règle CORS autorisant l'origine de l'application.
- La qualité de lecture de l'écriture manuscrite varie selon le modèle, la résolution et la qualité des photos. Un score de confiance fourni par un modèle n'est pas une mesure statistique calibrée.
- Les propositions, preuves et justifications générées peuvent être erronées. Contrôlez-les sur la copie originale ; aucune note n'est validée automatiquement.
- Les corrections archivées, les images incluses dans leur instantané et les retours de l'enseignant sont conservés dans IndexedDB du profil de navigateur. Ils ne sont pas synchronisés par l'application, mais peuvent disparaître si les données du site sont effacées. Ce stockage local n'est pas un coffre-fort : protégez l'accès à l'appareil et au profil navigateur.
- La transcription du sujet de référence reste en mémoire de la page pendant la session ; les photos et transcriptions ne constituent pas encore un dossier complet de devoir partagé entre appareils.

## Architecture

Voir [`docs/architecture.md`](docs/architecture.md) pour les couches, les flux, les règles de dépendance et la stratégie de tests.

- `src/domain` : règles métier, barème, propositions de notation, mémoire locale et archives.
- `src/ports` : contrats des fournisseurs IA et de persistance.
- `src/application` : orchestration des cas d'usage et services.
- `src/adapters/ai` : intégration avec Ollama et ajout du contexte local aux requêtes de correction.
- `src/adapters/files` : préparation locale des photos/PDF et import de barèmes.
- `src/adapters/storage` : persistance IndexedDB.
- `src/ui` : préparation, diagnostic, correction, révision et validation enseignante.
- `tests` : tests unitaires, d'intégration, de contrat UI et parcours Playwright.

La décision finale appartient toujours à l'enseignant.

## Design system

The shared UI foundations are documented in [`docs/design-system.md`](docs/design-system.md).

- Design tokens live in `src/ui/design-system/tokens.css`.
- Shared control styles live in `src/ui/design-system/controls.css`.
- Reusable React primitives are exported from `src/ui/design-system/index.ts`.
- Feature styles own layout and domain composition; they must not fork the appearance of shared controls.
- Contract tests run as part of `npm test`.

New forms should use `Field`, `TextInput`, `TextArea`, `Checkbox` and `Button`. Existing native selects keep native keyboard and assistive-technology semantics; their closed control is styled consistently, while the operating-system option popup remains browser-controlled.
