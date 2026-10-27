# Architecture

## Principes

- React + TypeScript + Vite ; logique métier séparée de l'interface.
- Traitement local par défaut : les fichiers sont convertis dans le navigateur, puis transmis uniquement à l'endpoint Ollama configuré explicitement.
- Aucun repli silencieux vers une API cloud.
- Contrats typés pour le fournisseur IA et les propositions de correction.
- La correction proposée n'est jamais automatiquement validée.

## Flux

1. L'enseignant ajuste un barème typé et sa consigne.
2. Les photos sont lues localement. PDF.js convertit les pages PDF en images en mémoire, avec limites de taille et de nombre de pages.
3. Le navigateur appelle l'API Ollama configurée avec les images et le barème.
4. La réponse JSON est validée : critères connus uniquement, points dans les limites du barème, éléments justificatifs et niveau de confiance.
5. Toute incertitude est présentée à l'enseignant ; il peut modifier les points, ajouter un commentaire, accepter ou exporter le récapitulatif.

## Limites connues

- Ollama doit être accessible depuis le navigateur ; la configuration CORS peut être nécessaire.
- Un modèle de vision est requis pour analyser les images.
- Le niveau de confiance est auto-déclaré par le modèle, ce n'est pas une mesure statistique calibrée.
- Les éléments justificatifs générés par le modèle peuvent être inexacts : ils doivent être vérifiés sur la copie originale.
- Le stockage persistant, OCR spécialisé, traitement par lot et authentification ne sont pas encore implémentés.
