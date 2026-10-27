# Companion Correcteur Devoir

Application React + TypeScript pour aider les enseignants en biologie à corriger des copies manuscrites à partir d'un barème, avec validation humaine et priorité au traitement local.

## Stack

- React + TypeScript + Vite
- Vitest pour les tests unitaires
- Contrats métier typés, indépendants de l'interface et du fournisseur IA
- Ollama comme fournisseur local cible

## Démarrage

```bash
npm install
npm run dev
```

Vérifications avant contribution :

```bash
npm run typecheck
npm test
npm run build
```

## Confidentialité et périmètre actuel

Cette fondation ne téléverse aucune copie et ne fait aucun appel IA. L'import d'images, l'OCR et l'intégration Ollama seront ajoutés dans des étapes distinctes. Le mode local devra rester explicite et ne jamais basculer silencieusement vers un fournisseur cloud.

Les suggestions de correction devront être justifiées par le barème et les éléments lisibles de la copie. Toute incertitude doit être signalée et soumise à l'enseignant ; aucune note ne sera validée automatiquement.
