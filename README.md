# Companion Correcteur Devoir

[![Tests](https://github.com/Sims07/Companion-Correcteur-Devoir/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Sims07/Companion-Correcteur-Devoir/actions/workflows/tests.yml)
[![Couverture unitaire](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FSims07%2FCompanion-Correcteur-Devoir%2Fmain%2Fbadges%2Fcoverage.json)](https://github.com/Sims07/Companion-Correcteur-Devoir/actions/workflows/tests.yml)

Application React + TypeScript pour aider les enseignants en biologie à corriger des copies manuscrites à partir d'un barème, avec validation humaine et priorité au traitement local.

## Stack

- React + TypeScript + Vite
- Vitest pour les tests unitaires
- PDF.js pour convertir les pages PDF en images directement dans le navigateur
- Ollama comme fournisseur IA local configurable

## Démarrage

```bash
npm install
npm run dev
```

Vérifications avant contribution :

```bash
npm run typecheck
npm test
npm run test:coverage
npm run test:coverage:core
npm run build
```

## Couverture des tests

- `npm run test:coverage` : mesure la couverture ligne/fonction/branche du code TypeScript hors composition UI et produit un rapport HTML dans `coverage-unit/`.
- `npm run test:coverage:core` : rapport ciblé sur le domaine et les cas d'usage (`coverage-unit-core/`).
- Le contrat TypeScript des ports est exclu du pourcentage car il ne contient pas de comportement exécutable ; les adaptateurs de fichiers restent dans le périmètre et sont testés.
- Le badge reflète la couverture de lignes mesurée par Vitest. La CI recalcule sa valeur à chaque PR et échoue si le fichier du badge n'a pas été mis à jour dans la PR : le badge reste ainsi cohérent sans pousser automatiquement de commits sur `main`. Il ne remplace pas les tests de parcours navigateur ni une analyse de la pertinence pédagogique.

Les seuils ne sont pas encore bloquants : on publie d'abord une mesure réelle, puis on pourra fixer des objectifs réalistes après avoir renforcé les tests sur les zones critiques.

## Utiliser le flux de correction local

1. Modifiez le barème d'exemple ou ajoutez/supprimez des critères.
2. Importez des photos JPG/PNG/WebP ou un PDF (10 pages maximum, 15 Mo par fichier). Les PDF sont rendus en images dans le navigateur ; aucun fichier n'est téléversé.
3. Configurez l'adresse d'Ollama, par défaut `http://localhost:11434`, puis testez la connexion pour lister les modèles installés.
4. Choisissez séparément un **modèle de lecture (vision)** et un **modèle d'analyse/notat​​ion**. Le premier transcrit chaque page en local ; le second applique le barème à cette transcription et produit le JSON de correction. Les deux peuvent être le même modèle, mais un modèle de vision est nécessaire pour la lecture des images.
5. Renseignez la consigne et lancez l'analyse. Le streaming indique d'abord la transcription, puis la génération de la correction.
5. Révisez les points, les éléments justificatifs et le niveau de confiance critère par critère. Les propositions à faible confiance déclenchent une question. Exportez au besoin un récapitulatif JSON local.

## Confidentialité et limites

- Les copies sont préparées en mémoire dans le navigateur et envoyées uniquement à l'endpoint Ollama explicitement configuré. Aucun fournisseur cloud n'est utilisé comme solution de secours.
- Le serveur Ollama doit être installé sur une machine que vous contrôlez. Si l'endpoint n'est pas local, les copies iront à cet endpoint ; vérifiez-le avant l'utilisation.
- Selon le navigateur, Ollama peut nécessiter une configuration CORS pour autoriser l'origine de l'application.
- Utilisez un modèle de vision. Les performances sur l'écriture manuscrite varient selon le modèle et la qualité des photos.
- Les propositions générées peuvent être erronées. Les éléments cités doivent être contrôlés ; aucune note n'est validée automatiquement.
- Les copies et propositions ne sont pas persistées par l'application. L'export est une action explicite de l'enseignant.

## Architecture

- `src/domain` : validation du barème et contrat de proposition de correction
- `src/ports` : contrats IA typés
- `src/adapters/ai` : client Ollama local
- `src/adapters/files` : conversion locale des photos et PDF
- `src/ui` : flux de préparation, correction et validation enseignante
- `tests` : tests unitaires du barème, du fournisseur IA et des propositions

La décision finale appartient toujours à l'enseignant.
