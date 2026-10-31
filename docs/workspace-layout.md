# Espaces de travail

Correction et Évaluation de modèle partagent un même cadre de page afin de conserver une identité visuelle cohérente.

## Règles communes

- Canevas desktop centré de 1 560 px maximum.
- Gouttières horizontales fluides sur desktop et 16 px sur mobile.
- Même hauteur de référence pour l'en-tête global.
- Espacement vertical généreux entre l'en-tête de page, la navigation et le contenu.
- Les panneaux utilisent les mêmes tokens, rayons et règles de densité du design system.

## Variantes métier

- **Correction** conserve une navigation latérale persistante pour le devoir, les étapes et le suivi du traitement. Le contenu principal bénéficie d'une colonne flexible et de panneaux plus spacieux.
- **Évaluation de modèle** conserve sa navigation horizontale par étapes, adaptée à la comparaison de configurations et de résultats.

Les layouts partagent les dimensions et le rythme, pas les composants métier. Éviter de fusionner les parcours dans un composant conditionnel géant.

## Responsive

À 980 px, la sidebar de correction se compacte. À 720 px, elle devient une navigation supérieure et les deux espaces utilisent des gouttières mobiles de 16 px.

Toute évolution de ces cadres doit préserver les navigations propres à chaque parcours et être couverte par les tests de contrat UI.

## Bibliothèque des devoirs

La gestion multi-devoirs est accessible dans un espace enseignant pleine largeur « Mes devoirs », distinct du canevas de correction. La bibliothèque présente les devoirs sous forme de cartes, permet la recherche par titre, description ou formation et propose des filtres par état de préparation et présence de corrections archivées. La barre latérale de correction conserve un accès compact au devoir actif et un raccourci vers cette bibliothèque.

Les profils de devoirs et les corrections archivées restent stockés localement dans le navigateur. La bibliothèque ne crée aucune synchronisation distante.
