# Mesurer les stratégies de correction sur 30 copies

## But

Comparer le parcours **classique** (Vision + analyse générative) au parcours
**décisionnel** (Vision + décisions fermées sur les attendus) sans mélanger
les contraintes de lecture et les contraintes pédagogiques.

Les modèles System One / D3 et leurs probabilités doivent rester expérimentaux
tant que leur disponibilité locale, leurs preuves visuelles et leur calibration
n'ont pas été validées. Un score de probabilité n'est pas une note.

## Protocole reproductible

1. Constituer un jeu local de 30 copies représentatives : textes corrects,
   incomplets, erreurs de biologie, écritures difficiles, tableaux et schémas.
   Conserver un barème unique comportant des sous-critères explicites.
2. Établir les notes de référence et les éléments clés avec un enseignant.
   L'enseignant conserve la décision finale.
3. Enregistrer deux profils IA utilisant **exactement le même modèle Vision et
   le même modèle d'analyse**, mais des stratégies différentes. Pour le premier
   essai, un même Qwen évite des changements de modèles coûteux en RAM.
4. Pour chaque copie, évaluer les deux stratégies sur la même entrée
   (nouvelle lecture pour une correction réelle, ou transcription commune
   explicitement choisie dans Évaluation des modèles). Mesurer lecture,
   analyse, durée totale, tokens lorsqu'ils sont disponibles, réponses
   inexploitables/reprises et temps de validation enseignant.
5. Contrôler séparément les schémas : critère explicite sans sous-critères =
   analyse visuelle classique conservée ; sous-critères = points calculés à
   partir des éléments visuellement reconnus. Les décisions partielles et
   incertaines nécessitent une vérification humaine.
6. Agréger les mesures après **30 copies complètes**, et pas sur une réponse
   unique. Comparer le taux de notes modifiées par l'enseignant, les erreurs
   graves (ex. confusion scientificité/illisibilité), les éléments sans preuve
   et les temps totaux (incluant le chargement et le changement de modèle).

## Seuils de décision

Ne pas déclarer un gain de performance sur un simple nombre de tokens ou une
petite démonstration. Une méthode n'est recommandée que si elle réduit le temps
total **sans augmentation inacceptable des erreurs de note ou des vérifications
enseignantes**. En cas de doute scientifique ou de preuve non vérifiable :
signalement, pas de note définitive automatiquement.

## Limites assumées

- Aucun temps ni débit sur Mac Intel n'est présumé ; mesures à réaliser sur
  le poste réel (16 Go de RAM, CPU, une seule inférence à la fois).
- Les probabilités fournies par certains Decision Models ne sont pas
  nécessairement calibrées : ne pas multiplier directement une probabilité
  par les points du barème.
- La transcription et l'analyse visuelle sont des sources d'erreurs distinctes.
  Une décision structurée ne corrige pas une mauvaise lecture de la copie.
- Le parcours décisionnel proposé utilise actuellement un LLM local
  conventionnel avec sortie JSON fermée. L'API native System One reste
  une extension future, conditionnée à la compatibilité et à un benchmark
  pédagogique.
