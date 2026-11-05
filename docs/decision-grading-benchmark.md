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
- Le parcours décisionnel dispose de l'API native System One sur Ollama
  pour les modèles compatibles (D1, TEV1, D3...). Son transport
  `/v1/systemone` n'est **pas** un streaming de texte.
- Pour un critère avec sous-critères pondérés, chaque attendu est vérifié
  séparément ; le score est calculé selon les pondérations explicites.
  Si une liste d'attendus figure dans une description avec des points
  valides et une somme exacte, elle peut être interprétée localement ;
  aucune répartition implicite n'est inventée.
- Pour un critère *global* sans sous-critères, System One choisit une
  **valeur de points autorisée par le maximum enseignant**, au lieu
  d'appliquer systématiquement 50 % dès qu'il répond « partiel ».
  **Une échelle plus fine n'est pas une preuve de précision pédagogique** :
  elle reste provisoire tant qu'elle n'a pas été comparée à des corrections
  d'enseignants.
- L'alignement global du sujet et du barème est évalué une seule fois
  par copie multi-critères. Un barème manifestement étranger à la copie
  ou une transcription illisible ne doit pas recevoir une note inventée.
- Les modèles System One ne rendent pas de citations textuelles :
  la recherche locale de mots dans la transcription est une aide,
  jamais une preuve de correction. Son absence ne déclenche pas à elle
  seule une alerte. Les décisions ambigües, partielles ou illisibles
  restent signalées avec un motif ciblé.

## Jeu de validation pédagogique recommandé

Pour confirmer que cette amélioration allège le travail au lieu de simplement
réduire les alertes affichées, comparer **D1, TEV1, D3 et un modèle génératif**
sur les mêmes 10 premières copies puis 30 copies, avec un même modèle Vision
et un barème validé comportant des attentes explicites.

Relever : note de référence /10 ou /20, différence absolue avec la note
enseignante, erreurs graves (hors sujet noté, réponse illisible comptée 0),
proportion de critères réellement à examiner, temps de reprise par le
professeur, durée et consommation. Tester des copies correctes, partielles,
fausses, à contresens scientifique, hors sujet et illisibles. Tester un cas
où les mots de l'intitulé ne figurent pas littéralement dans une réponse
correcte et un cas où le sujet imprimé contient le mot attendu mais la
réponse ne le contient pas.

Critère de succès : réduire **à la fois** les écarts avec les références
enseignantes et la charge de vérification. Ne jamais déclarer un modèle
« fiable » sur la seule base d'un 6/6 de faible confiance ou de 0
question à vérifier.

## Version des prompts et comparaison locale

Pour comparer deux modèles ou deux versions de prompts, conserver **le même jeu de copies, le même barème et la même transcription de référence** lorsque l'on mesure uniquement l'analyse. Refaire la lecture des images dans une série séparée pour mesurer le pipeline complet sans masquer les erreurs OCR.

Relever par copie et par configuration : identifiants et versions des prompts effectivement utilisés, appels du modèle (dont réparations), temps total incluant le chargement, tokens d'entrée et de sortie lorsqu'ils sont remontés, note et statut non évalué, motifs de contrôle enseignant et écart avec la référence. Pour System One natif, compter les questions fermées et les appels `/v1/systemone`, sans assimiler les probabilités à une note ni à une preuve. Ne conclure à un gain qu'après comparaison sur des copies variées et validation par l'enseignant.

## Comparaison visible dans Observabilité

La section **Fiabilité face aux corrections de référence** utilise les notes de
référence déjà saisies par le professeur dans les outils de diagnostic. Elle
regroupe uniquement les exécutions du même devoir, même barème (y compris
description et pondérations), même lecture Vision, même modèle d'analyse et
même méthode (générative, décision chat ou System One natif). Aucune photo
supplémentaire n'est stockée pour ce tableau.

Une copie partiellement évaluée, une erreur de transport et un critère ayant
un score provisoire nul en attendant l'enseignant ne doivent **jamais** être
comptés comme des notes 0 dans l'écart à la référence. Ils sont comptabilisés
séparément comme copies non comparables. Les anciennes traces qui ne
mémorisent pas la méthode de correction ne sont pas agrégées par hypothèse.

Les moyennes présentées concernent les copies entièrement comparables ; les
durées incluent les exécutions avec référence, même en cas d'échec. Les
mesures sont **exploratoires avant 10 copies**, préliminaires entre 10 et 29,
et nécessitent encore une validation pédagogique avec 30 copies ou plus.
Un écart de note proche de zéro ne garantit pas à lui seul l'exactitude des
justifications biologiques ou des preuves graphiques.
