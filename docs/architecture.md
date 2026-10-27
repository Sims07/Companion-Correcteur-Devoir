# Architecture initiale

## Objectif

Construire un assistant de correction pour les enseignants en biologie, avec contrôle enseignant explicite et traitement local par défaut.

## Principes de conception

- **Local-first** : les photos, les extractions OCR et les retours de correction ne doivent pas quitter le poste local sans action explicite de l'enseignant.
- **Ollama configurable** : le futur adaptateur LLM utilisera une URL locale et un modèle configurables. Aucun fournisseur cloud ne sera activé par défaut.
- **Barème explicite** : les critères et leurs points sont des données structurées validées côté serveur.
- **Incertitude visible** : toute suggestion peu sûre ou nécessitant une interprétation sera marquée pour relecture et pourra poser une question à l'enseignant.
- **Décision humaine** : aucune note finale n'est publiée automatiquement.
- **Traçabilité** : les suggestions devront conserver justification, version du barème et validation/correction humaine.

## Étapes proposées

1. Socle API et validation des barèmes (cette PR).
2. Configuration et contrôle de disponibilité d'Ollama, avec tests simulés.
3. Import local des images et prétraitement sans téléversement.
4. OCR/vision locale et extraction structurée avec indicateurs de confiance.
5. Comparaison au barème, questions de clarification et interface de relecture.
6. Export des résultats après validation de l'enseignant.

## Sécurité et confidentialité

Ne pas journaliser le contenu des copies, les images, les noms d'étudiants ni les réponses complètes. Les futurs tests doivent vérifier que les traitements locaux ne font aucun appel réseau externe. Les limites de confidentialité devront être documentées, notamment les journaux, les sauvegardes et la configuration du modèle.

## État actuel

Cette première base ne reçoit ni ne stocke de copies et n'appelle pas Ollama. Elle expose un contrôle de santé et un endpoint de validation des barèmes.
