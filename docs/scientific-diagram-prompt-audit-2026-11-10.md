# Audit des prompts de schémas scientifiques — 10 novembre 2026

## Conclusion et périmètre

L’inspection du code confirme une marge d’amélioration des consignes de lecture. Elle ne démontre pas encore une amélioration des réponses d’un modèle réel. Les tests logiciels vérifient les requêtes et les garde-fous, pas la perception des pixels par Qwen, Saluki ou un modèle décisionnel.

Audit des parcours de correction directe, analyse par page, décisions visuelles System One, Vision puis décisions, test standard/questions ciblées, graphe indépendant et zoom. Les prompts de correction textuelle, l’OCR général et les barèmes des enseignants restent hors du périmètre de modification.

## Cartographie des approches

| Approche | Ce que le modèle reçoit | Limite principale |
| --- | --- | --- |
| Image → correction générative | Images, consigne, sujet éventuel, barème dans `directDiagramPrompt.ts` | Observation et notation dans le même appel : le barème peut suggérer la réponse |
| Analyse scientifique par page | Une image, critères visuels, sujet dans `scientificDiagramPrompts.ts` | Même biais ; nombreuses contraintes de sortie et agrégation ultérieure par le logiciel |
| Image → décisions System One | Images, état commun, questions fermées dans `systemOneDecision.ts` | Aucune preuve textuelle détaillée de la lecture ; décisions provisoires à vérifier |
| Vision → décisions sur les observations | Analyse visuelle précédente puis conversion dans `scientificDiagramDecisions.ts` | La conversion ne relit pas les pixels : une erreur visuelle initiale peut se propager |
| Standard / questions ciblées | Même image et barème ; consigne supplémentaire dans `scientificDiagramSensitivity.ts` | Le mode ciblé n’est pas une extraction indépendante, ni une lecture à l’aveugle |
| Graphe indépendant | Image seule et schéma JSON générique dans `scientificDiagramBlindGraph.ts` | Graphe limité aux étiquettes, flèches et inclusions ; pas une représentation complète de la morphologie biologique |
| Zoom de flèche incertaine | Recadrage calculé depuis les coordonnées proposées par Vision, identifiants des extrémités | Localisation éventuellement fausse ; détails perdus dans l’original irrécupérables par agrandissement |

## Constats et corrections

### Lot 1 — Lecture et notation

1. **Correction directe trop centrée sur la forme JSON.** La formule « examine directement » et l’interdiction d’inventer ne précisaient pas comment contrôler une relation. Ajout d’un bloc partagé : deux extrémités, trait continu, pointe, cible réelle, croisements, traits de légende et contours complets. Aucun exemple biologique attendu n’est injecté dans ce bloc.
2. **Confusion possible entre présence d’un mot et preuve structurale.** La règle est étendue aux connexions et aux inclusions, sans ajouter de critère au barème.
3. **Relance courte moins protectrice que le premier appel.** Elle conserve désormais les règles de lecture et demande explicitement la vérification en cas d’ambiguïté. Elle reste plus courte que le prompt complet.
4. **Consigne trop large d’exclusion des marques manuscrites.** Un cercle ou une rature peut appartenir au dessin étudiant. Exclusion des seules annotations professorales identifiables ; doute d’origine signalé.
5. **Preuves limitées à huit mots.** Dans les réponses complètes, plafond porté à vingt mots afin de permettre de nommer les éléments reliés et le constat. La relance après troncature conserve des preuves courtes pour limiter la sortie.
6. **Décision visuelle sans protocole précis de lecture géométrique.** Le bloc partagé est ajouté uniquement lorsque l’appel est visuel et contient des critères scientifiques. Pas de changement du parcours décisionnel textuel.
7. **Versions d’observabilité.** Révisions incrémentées pour les prompts modifiés : direct 2, réparation directe 2, analyse scientifique 5, System One visuel 4. Deux attentes de tests System One textuel étaient déjà désynchronisées du registre (7) ; elles sont alignées sans modifier ce prompt.

8. **Points partiels suggérés dès qu’un attendu manque.** L’ancienne phrase pouvait encourager une note partielle même lorsque rien n’est correct. Le prompt exige désormais une partie correcte démontrée et distingue le zéro confirmé de l’illisibilité.

### Lot 2 — Graphe et recadrage

1. **Ambiguïté de type dans le graphe.** « Si tu hésites, utilise unclear » suivait la définition du booléen `arrowsComplete`. Distinction explicite : complétude true/false ; tip/relation peuvent être unclear.
2. **Flèche à deux pointes non explicitée.** Deux entrées sont demandées dans le graphe, une par pointe. Le comparateur existant conserve l’indécision face à des directions opposées plutôt que sélectionner arbitrairement un sens.
3. **Zoom sans contrat JSON explicite.** En mode API compatible, le format utilisé est JSON générique ; le prompt décrit désormais la clé `tip` et ses valeurs autorisées.
4. **Recadrage potentiellement incomplet.** Avant d’affirmer une direction, le prompt exige les deux extrémités identifiables et le trait complet. Sinon : unclear. Les identifiants extraits sont sérialisés comme données JSON.
5. **Bornes de recadrage.** Validation des coordonnées avant décodage. Une zone hors image, inversée ou non numérique est rejetée. La marge existante est conservée ; aucune rotation ni suppression de contexte supplémentaire n’est introduite.

## Préparation réelle des images

`localFiles.ts` conserve actuellement les JPEG et PNG octet pour octet. L’ancienne hypothèse d’une réduction systématique à 1 300 pixels ne s’applique donc plus à cet import. Les PDF sont rendus en PNG, avec une dimension maximale de 2 200 pixels et un facteur maximal de 3. Les rotations de travail sont réencodées en PNG sans redimensionnement.

L’analyse scientifique par page demande `imageDetail: high`. Cela ne garantit pas la résolution effectivement utilisée par chaque serveur ou encodeur visuel.

Le zoom du graphe concerne au maximum deux traits classés none/unclear et dotés de coordonnées utilisables. La marge vaut au moins 24 pixels, 25 % de la taille du rectangle ou 6 % de l’image selon l’axe. L’agrandissement est plafonné à ×2 et 2 048 pixels. Les zones trop petites, presque pleine page ou insuffisamment agrandissables sont ignorées. Le PNG évite une compression destructive supplémentaire, mais l’interpolation n’ajoute aucune information scientifique.

Ce zoom appartient au laboratoire du graphe indépendant. Il n’est pas automatiquement appliqué à toutes les corrections professorales. Aucun recadrage global automatique n’est ajouté : il pourrait supprimer une légende, un contour ou une connexion.

## Limites qui restent à traiter ou mesurer

- Le barème reste visible dans les appels de notation : demander « observe d’abord » ne crée pas une séparation technique entre observation et jugement.
- Le schéma direct exige des points numériques même si la preuve est indisponible. Le prompt demande une question à l’enseignant, mais ne fournit pas un état indécidable par sous-critère. Une évolution du contrat et de la présentation des notes serait un lot fonctionnel distinct ; le seul prompt ne résout pas cela.
- Dans l’analyse par page, `origin=uncertain` n’apporte aucun point et doit déclencher une révision. Ne pas interpréter ces points provisoires comme une faute confirmée.
- `arrowsComplete` reste une déclaration du modèle. Une déclaration erronée peut transformer une connexion non relevée en absence dans le comparateur.
- Le graphe ne distingue pas formellement tous les types de traits (légende, flux, inhibition), ni les structures anonymes répétées. Il ne suffit pas à couvrir toute la mitose ou la réplication.
- Une pointe réellement absente et une pointe illisible conduisent toutes deux à une décision incertaine dans le comparateur actuel. Politique conservatrice, à distinguer d’une notation explicite de l’absence de pointe.
- Le zoom ne corrige pas une lecture erronée déjà déclarée certaine et ne vérifie pas automatiquement ses coordonnées. Ajouter la vue globale à chaque zoom serait une expérience supplémentaire, avec coût et compatibilité multimodale à mesurer.
- Les limites de génération et de contexte ne sont pas augmentées ici. Le graphe reste à 768 tokens de sortie/2 048 de contexte local ; sur un dessin dense, une troncature reste possible. Le protocole actuel ne justifie pas un réglage universel plus coûteux.
- Le mode questions ciblées devient plus proche du mode standard renforcé. Il demeure utile comme comparaison, mais son bénéfice supplémentaire peut diminuer.

## Validation et expérience suivante

Tests de contrat pour tous les prompts et relances, isolation du chemin textuel, intégration du zoom, maintien de l’incertitude et rejet des coordonnées invalides. Les suites existantes couvrent le transport, le parsing et le calcul des notes. La CI complète comprend également les tests navigateur.

Pour mesurer l’effet réel : conserver exactement les mêmes six images S0–S5, le même modèle réel (pas seulement le nom du profil), quantification, serveur et paramètres ; comparer l’ancienne révision à la nouvelle avec au moins trois répétitions. Mesurer séparément flèche inversée, mauvaise cible, inclusion fausse, invariance de disposition et abstention sur pointe illisible. Ajouter ensuite des copies manuscrites dont les références sont validées par un professeur. Rapporter erreurs acceptées à tort, corrections rejetées à tort, indécisions, variabilité, durée, troncatures et appels de zoom. Une meilleure note moyenne seule ne démontre pas une meilleure lecture.

Aucun résultat d’inférence réelle ni gain de précision n’est revendiqué dans cet audit.
