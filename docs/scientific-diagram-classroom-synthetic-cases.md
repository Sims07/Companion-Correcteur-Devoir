# Batterie R1/R2/R3 — mitose végétale, profils de corrections de classe (16/11/2026)

## Origine et confidentialité

Trois copies privées annotées par un professeur ont été **examinées une seule fois comme inspirations pédagogiques**. Le dépôt ne contient **aucune photographie, partie d’image, écriture manuscrite, nom, date, note manuscrite, commentaire littéral du professeur ou fichier original**. Les figures livrées sont des illustrations vectorielles inédites et déterministes produites pour l'application. Elles sont créées à partir de scénarios généraux (oubli d'une phase, pointage faux, membrane nucléaire en métaphase) plutôt que du tracé d'un élève.

Dans l'application, les SVG sont convertis **localement en PNG avant l'analyse**, comme pour D/E. L'image n'est pas transmise en tant que code SVG au modèle. Les tests automatisés et le rapport exporté n'incluent jamais les copies privées.

## Distinction essentielle entre notes

| Cas synthétique | Score observé sur une copie privée, non réutilisable comme vérité terrain | Score de référence du *nouveau dessin*, calculé sur le barème actuel | Point majeur à vérifier |
|---|---:|---:|---|
| R1 | 9,5/10 | 9,50/10, provisoire | Interphase obligatoire absente ; autres phases et légendes lisibles |
| R2 | 5,75/10 | 5,30/10, provisoire | Pointage « cytoplasme » vers le noyau, paroi simplifiée et télophase sans cloison |
| R3 | 6,75/10 | 6,67/10, provisoire | Interphase absente, membrane nucléaire représentée en métaphase et microtubules légendés |

**Les deux colonnes de notes ne sont pas interchangeables.** Les notes synthétiques ne sont pas une reproduction numérique du jugement d'un enseignant. Chaque sous-critère est explicite dans \`scientificDiagramFixtures.ts\` et la fiche UI. Avant de s'appuyer sur ces valeurs comme référence scientifique validée, faire arbitrer les 19 sous-critères des trois dessins par deux enseignants, idéalement en aveugle.

## Pourquoi ces dessins sont différents des pilotes historiques

- A/B/C contrôlent la qualité graphique globale sur des exemples artificiels de trois niveaux.
- D/E isolent le défaut de destination de traits de rappel sur deux images contrôlées.
- **R1/R2/R3** apportent trois profils pédagogiques composés, inspirés de défauts réellement soulignés en classe. Ils ne sont pas de nouvelles copies anonymisées et n'ont aucune identité source.

La suite R1/R2/R3 est une batterie distincte dans **Tests → Schémas scientifiques → Cas de classe synthétiques**. On peut lancer un seul dessin, les trois en un clic, et faire 1, 3 ou 5 répétitions. Les méthodes du laboratoire restent disponibles. Les rapports vont dans l'historique sous \`classroom\`, sans effacer les batteries A/B/C et D/E.

## Prise en compte dans les radars

Le radar n'agrège que les séries \`R1\`, \`R2\`, \`R3\` **complètes et techniquement réussies**, sans changer l'identification des 9 axes. Les décisions du nouveau jeu apportent de la preuve aux axes « Qualité graphique », « Précision », « Couverture », « Stabilité » (si 3 répétitions) et « Performance » (si les durées natives sont disponibles). Les scores « Qualité graphique » et « Précision » utilisent le nombre total d'attendus plutôt que la moyenne de notes par dessin ; la provenance synthétique provisoire est annoncée dans le détail de l'axe.

Une sortie sans décision, une série partielle, un modèle indisponible ou une lecture indécidable ne doit pas être présentée comme un score vérifié. Les rapports historiques restent conservés et les scores historiques ne sont pas recopiés dans les références des dessins R1/R2/R3.

## Vérification

- Tests unitaires : absence d'images privées et de métadonnées personnelles, quatre panneaux, erreur attendue par cas, 19 références explicites, distinction des notes.
- Tests d'intégration des radars : agrégation A/B/C + R1/R2/R3, non-écrasement de la batterie ancienne, exclusion des séries incomplètes, caractère non global du score.
- Test de parcours : affichage des trois cartes, prévisualisations, avertissement sur la référence provisoire, accès au lancement de la suite.

**Limite** : ces trois figures synthétiques simplifient nécessairement la richesse des traits de crayon humains. Un résultat élevé sur ces figures ne démontre pas la fiabilité sur des copies réelles. Ne jamais ajouter les photos privées au dépôt ou dans les fixtures pour combler cet écart.
