# Espaces de travail

Correction et Outils IA partagent un même cadre de page afin de conserver une identité visuelle cohérente, sans mélanger les usages des professeurs et ceux du développeur.

## Règles communes

- Canevas desktop centré de 1 560 px maximum.
- Gouttières horizontales fluides sur desktop et 16 px sur mobile.
- Même hauteur de référence pour l'en-tête global.
- Espacement vertical généreux entre l'en-tête de page, la navigation et le contenu.
- Les panneaux utilisent les mêmes tokens, rayons et règles de densité du design system.

## Variantes métier

- **Correction** conserve une navigation latérale persistante pour le devoir, les étapes et le suivi du traitement. Le contenu principal bénéficie d'une colonne flexible et de panneaux plus spacieux.
- **Outils IA** constitue une section distincte, destinée au développeur et au dépannage ponctuel avec un professeur. Elle regroupe trois vues sous une navigation secondaire commune : **Observabilité** (exécutions et prompts conservés), **Inspecteur réseau** (requêtes HTTP en direct) et **Évaluation des modèles** (expériences contrôlées). Une seule entrée « Outils IA » apparaît dans la navigation principale, à côté de « Correction ».
- **Évaluation des modèles** conserve sa navigation interne par étapes, adaptée à la comparaison de configurations et de résultats. Les historiques des trois outils ne sont pas fusionnés : les traces IA, les requêtes HTTP et les essais ont chacun leur source et leur durée de conservation.
- L'interface enseignant n'affiche ni prompts, ni payloads, ni métriques techniques. Le professeur peut toutefois ouvrir les Outils IA à la demande pendant une séance de dépannage, sans configuration de rôle ni verrouillage supplémentaires.
- Les libellés de confidentialité suivent le transport effectivement configuré : un profil Ollama local et un profil API compatible OpenAI n'ont pas les mêmes garanties de localisation des données.

Les layouts partagent les dimensions et le rythme, pas les composants métier. Éviter de fusionner les parcours dans un composant conditionnel géant.

## Responsive

À 980 px, la sidebar de correction se compacte. À 720 px, elle devient une navigation supérieure et les deux espaces utilisent des gouttières mobiles de 16 px.

Toute évolution de ces cadres doit préserver les navigations propres à chaque parcours et être couverte par les tests de contrat UI.

## Bibliothèque des devoirs

La gestion multi-devoirs est accessible dans un espace enseignant pleine largeur « Mes devoirs », distinct du canevas de correction. La bibliothèque présente les devoirs sous forme de cartes, permet la recherche par titre, description ou formation et propose des filtres par état de préparation et présence de corrections archivées. La barre latérale de correction conserve un accès compact au devoir actif et un raccourci vers cette bibliothèque.

Les profils de devoirs et les corrections archivées restent stockés localement dans le navigateur. La bibliothèque ne crée aucune synchronisation distante.
