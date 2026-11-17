# Cohérence des notes des dessins scientifiques

## Pourquoi ce contrôle

Une sortie de modèle peut fournir une preuve textuelle incompatible avec les points attribués : exemple réel, un titre « en minuscules, sans soulignement ni encadrement » noté 0,33/0,33 pour « souligné OU encadré OU en majuscules ». La validité JSON et la somme des points ne suffisent pas à empêcher cette incohérence.

## Règles appliquées

- Si le professeur demande l'une des propriétés « souligné OU encadré OU en majuscules », la correction directe demande trois observations booléennes sur le **titre principal** : `underlined`, `framed`, `uppercase`.
- Les points sont calculés par le logiciel : au moins une propriété confirmée donne le maximum, aucune donne zéro. Un désaccord avec les points générés ou avec une absence explicitement mentionnée dans la preuve déclenche une vérification enseignante (confiance basse).
- Les traces Vision plus anciennes, dépourvues de booléens, bénéficient d'un contrôle ciblé de la preuve **uniquement** lorsqu'elle affirme explicitement les trois absences. La correction n'utilise pas une recherche générique de mots négatifs pour déduire des points d'autres critères.
- Pour un titre décrit explicitement au-dessus de la composition, la règle « placé en dessous » est également contrôlée. Les autres dimensions du titre restent notées séparément.

Les calculs restent des propositions vérifiables sur la photographie : une transcription ou observation erronée demande une revue humaine. Le moteur ne remplace pas le jugement sur la biologie, les proportions ou les légendes.

## Comparer les barèmes dans le Laboratoire

L'historique scientifique compare déjà les mesures de campagnes par protocole, modèle, méthode et dessin. Il signale désormais si la formulation du barème a changé à identifiants et points constants et quels critères ont été précisés. Si la pondération change, il indique que les notes ne sont pas directement comparables.

**Limite :** la comparaison de deux campagnes historiques ne prouve pas à elle seule une amélioration causée par le barème. Pour en mesurer l'effet, il faut exécuter les mêmes images synthétiques avec le même modèle, les mêmes paramètres, les mêmes méthodes, le même corrigé de référence et la même convention de points. Aucune copie d'étudiant n'est nécessaire à ces évaluations.
