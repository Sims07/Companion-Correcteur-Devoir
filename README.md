# Companion Correcteur Devoir

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
npm run build
```

## Utiliser le flux de correction local

1. Modifiez le barème d'exemple ou ajoutez/supprimez des critères.
2. Importez des photos JPG/PNG/WebP ou un PDF (10 pages maximum, 15 Mo par fichier). Les PDF sont rendus en images dans le navigateur ; aucun fichier n'est téléversé.
3. Configurez l'adresse d'Ollama, par défaut `http://localhost:11434`, puis testez la connexion pour lister les modèles installés.
4. Choisissez un modèle compatible avec les images (vision), renseignez la consigne et lancez l'analyse.
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
