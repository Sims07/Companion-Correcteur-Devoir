# Protocole pilote — évaluation de schémas scientifiques (v1)

## Hypothèse

Un schéma scientifique présente des attendus visuels mesurables : cadrage, centrage, traits, titre, légendes et correspondance avec les structures représentées. Ce protocole **n’affirme pas** qu’un petit modèle de décision peut remplacer l’enseignant. Il doit mesurer, sur le même dessin, le compromis entre justesse, couverture des sous-critères, répétabilité et temps de correction.

Le mode de correction classique de Companion reste inchangé. Le laboratoire « Protocole — schéma scientifique », dans **Outils IA → Évaluation des modèles**, utilise les configurations déjà enregistrées, sans modifier le devoir ou le barème actif.

## Barème professeur fourni

Le barème d’origine comporte 10 points : qualité du dessin 4, titre 2, légendes 2, compréhension 2. Les sous-critères visuels explicités totalisent 15 attendus et **8 points exactement** (les décimales sont conservées). Le protocole intègre ces 15 attendus sans inventer d’exigences.

La compréhension de l’exemple dépend d’une préparation de mitose : interphase, télophase avec phragmoplaste, et deux autres phases choisies. Ces conditions ne valent pas pour un dessin d’un autre sujet. Par défaut, **les 2 points de compréhension sont exclus**. Pour les tester, importer un autre JSON avec des sous-critères détaillés et des points dont la somme égale leur critère (le validateur contrôle les deux). Un import du JSON d’origine ignore seulement la rubrique « Compréhension » sans sous-critères ; il ne modifie pas le fichier de départ.

Deux attendus méritent une clarification par le professeur avant validation scientifique : « Occupe toute la page » (laisser place aux titres et légendes) et « Fidèle à la réalité / proportions respectées » (nécessite une référence biologique). « Impression générale propre » reste partiellement subjectif, donc susceptible d’un taux d’incertitude élevé.

## Premier essai en un clic

1. Choisir une configuration Ollama locale dans « Configurations à exécuter » en bas de l’évaluateur. Choisir D1/D3 pour un parcours **System One image directe**, ou Qwen Vision + analyse générative/TEV1 pour un parcours **Vision puis analyse**. TEV1 n’est **pas** traité comme un modèle vision natif. Une configuration API distante peut recevoir les images ; ne sélectionner que des endpoints loopback pour un essai strictement local.
2. Importer le dessin scientifique, en un ou plusieurs fichiers (les pages restent dans un seul groupe image). Conserver si possible le sujet / contexte biologique dans le champ prévu.
3. Sélectionner facultativement la vérité terrain du professeur pour chaque sous-critère : présent, absent, partiel. Sans annotation, la **justesse est non mesurée**, même si le modèle est parfaitement répétable.
4. Lancer **3 passages** puis éventuellement **5 passages**. Les images déjà préparées sont réutilisées à l’identique ; modèles et passages exécutés séquentiellement pour ménager la RAM du Mac Intel. Le modèle reste chargé entre les répétitions identiques d’un profil, puis est libéré avant le profil suivant, même en cas d’interruption.
5. Exporter le rapport JSON pour comparaison. Il inclut les verdicts, les durées et les modèles, **jamais** les photographies, clés, endpoints, transcriptions, prompts ou réponses brutes. Le partage volontaire du rapport n’est pas un transfert de copie.

## Interprétation des mesures

| Indicateur | Définition | Attention |
|---|---|---|
| Justesse (%) | Part des verdicts strictement égaux à la référence renseignée par l’enseignant | Indisponible sans référence ; les verdicts « indécidable » comptent comme incorrects, pas comme « absent » |
| Couverture (%) | Proportion des verdicts présent / absent / partiel parmi toutes les décisions attendues | Un résultat répété « indécidable » ne signifie pas fiabilité |
| Stables et évalués | Sous-critères ayant exactement le même verdict résolu sur tous les passages planifiés | Une série incomplète reste non conclue |
| Justes à chaque fois | Sous-critères étiquetés correctement à **tous** les passages | Exige la vérité terrain et une série complète |
| Temps moyen | Temps mural moyen par passage pour ce profil (s) | Les modèles sont chargés/libérés séquentiellement, les coûts de chargement peuvent influer |
| Mode | System One direct image vs Vision + analyse | **Deux méthodes différentes** ; ne pas attribuer l’écart au modèle d’analyse seul |

Les probabilités d’un modèle décisionnel sont affichées comme sorties du modèle, **pas** comme des probabilités calibrées de correction. La notation numérique est secondaire ; les verdicts par critère et l’abstention passent en premier.

## Protocole d’évaluation scientifique recommandé après le pilote

Le premier essai (un schéma, 3 répétitions) valide le fonctionnement, **pas** la fiabilité. Construire ensuite un jeu annoté et consensuel de **20 à 30 dessins distincts**, couvrant :

- Dessin conforme, incomplet, propre mais scientifiquement faux, scientifiquement correct mais mal présenté.
- Titre absent, titre mal placé, titres ambigus ; légendes justes / fausses / absentes / désalignées.
- Proportions délicates, types de cellule ou tissus différents, structures invisibles ou légendes trompeuses.
- Photo nette, ombre, rotation, contraste dégradé, écriture manuscrite, plusieurs figures sur la page.
- Au moins deux sujets biologiques distincts, avec des références de compréhension **spécifiques**.

Deux enseignants consignent indépendamment les verdicts, résolvent les désaccords et figent un jeu de référence avant de comparer les modèles. Fixer les versions et quantifications (GGUF), CPU/RAM, contexte, préparation d’image, options, ordre des tests et température. Garder à part les essais de robustesse où l’image change : la répétabilité à image constante n’est pas une mesure de robustesse.

**Seuils exploratoires proposés, non validés** : viser au moins 95 % de justesse **sur les décisions résolues**, plus de 90 % de couverture, au moins 95 % de verdicts résolus stables, zéro note complète lorsqu’un critère essentiel est indécidable, et un gain de temps enseignant mesuré séparément. Comparer aussi la précision par classe, faux positifs, faux négatifs, intervalles d’incertitude, temps de revue humaine et taux de désaccord entre enseignants. Ne pas commercialiser un taux de fiabilité sur le seul jeu pilote.

## Périmètre technique et limites de cette première PR

Cette PR ajoute un **protocole d’évaluation**, pas un nouveau mode de correction en production. Les décisions et temps passent par les moteurs déjà disponibles et l’évaluateur existant. Les annotations de référence et les résultats restent en mémoire pendant la session ; les répétitions expérimentales ne dupliquent pas les photographies dans IndexedDB. Exporter le rapport JSON avant de recharger la page. Le rapport mesure un seul groupe d’images par série ; une future évolution pourra importer un jeu multi-schémas et calculer une agrégation statistique hors répétitions. La segmentation de structures, le calcul géométrique déterministe (alignement / centrage) et la calibration des probabilités ne font pas encore partie de ce protocole.

## Jeux A/B/C et D/E intégrés — protocole « en un clic »

Trois **images originales générées pour ce laboratoire** sont incluses dans le bundle (WebP), plus deux diagrammes vectoriels conçus pour tester la cohérence des légendes :
- A : travail soigné de mitose végétale, **cible 10/10**.
- B : travail intermédiaire de mitose végétale, **référence provisoire 7,36/10**, après revue visuelle du 8 novembre 2026.
- C : dessin volontairement insuffisant, **cible 0/10**.
- D : **témoin, cible provisoire 10/10** : mitose végétale en quatre phases, mots scientifiques justes et flèches aboutissant aux structures nommées.
- E : **piège, cible provisoire 9,32/10** : même image que D sauf les points d'arrivée de **quatre flèches**. « Chromosomes » ↔ « Fuseau mitotique » en métaphase ; « Noyau fils » ↔ « Plaque cellulaire » en télophase. Les mots eux-mêmes et les structures restent corrects et visibles.

Les cinq cartes affichent les images et leurs notes de référence. Le bouton **« Tester les 3 schémas en un clic »** conserve le jeu A/B/C ; le bouton **« Tester les flèches D/E en un clic »** compare la paire témoin/piège, dans les mêmes conditions et avec le même modèle. Chaque carte est testable isolément. D/E sont intégrés comme SVG déterministes puis **rasterisés localement en PNG** avant les appels : le modèle ne reçoit jamais le SVG, ni l'identifiant D/E, ni les erreurs attendues. Le passage unique (par défaut) donne un premier diagnostic rapide ; 3 ou 5 répétitions permettent de mesurer la stabilité.

Ce jeu utilise **le barème professeur complet /10** : les 15 attendus visuels inchangés (4 + 2 + 2 points) et 4 attendus de compréhension propres à cet exercice (2 points : interphase, télophase avec phragmoplaste, deux autres étapes distinctes). Toutes les références sont définies par sous-critère et le cas B contient des allocations partielles explicites qui totalisent 7,36 points. Pour ces seuls scénarios intégrés, la définition de l'attendu « légendes : structures visibles et flèches correctes » (0,68 point) précise que le trait de rappel doit pointer la **bonne** structure. Sans cette condition, une structure dessinée quelque part sur la page pourrait être considérée valide malgré une flèche erronée. D et E ont les **18 autres attendus identiques**. Le rapport JSON ajoute la nature du piège et la vérité terrain, pour mesurer les erreurs non détectées et les faux positifs ; il n'exporte pas les images. Les références doivent être revues par un enseignant avant d'être utilisées comme référence scientifique.

Les intitulés, la vérité terrain et les points cibles ne sont **jamais transmis dans les prompts en tant que corrigé**, uniquement les critères scientifiques de l’exercice.

**Attention :** le jeu est synthétique et les références actuelles 10/7,36/0 restent des **cibles de travail proposées**, non validées par un enseignant. Ce sont des scénarios d’essai, pas une preuve de précision sur de véritables copies. Les scores partiels ou l’absence de preuve visuelle demandent une vérification humaine. Le rapport JSON liste les attentes, les décisions, les notes obtenues, durées, modèles et erreurs, sans inclure les images, endpoints, clés ou données d’identification.

## Interpréter les résultats et les erreurs (correctif du premier pilote)

L’export pilote du 7 novembre 2026 présentait trois schémas (cibles 10/5/0), 3 configurations et **aucune décision récupérée**, y compris pour un profil TEV1 dont les trois appels avaient abouti mais dont les notes restaient indisponibles.

Cause identifiée dans l’extracteur du rapport : seul le protocole natif *image directe* était décodé. Le trajet **Vision → TEV1 System One sur transcription**, pourtant décisionnel, n’était pas relu depuis ses traces locales. Le correctif reconstruit désormais aussi ces réponses natives textuelles et distingue leur provenance (native-text vs native-image). L’absence de preuve textuelle ou une note finale nulle (null) n’efface plus les choix bruts du modèle. Elle n’autorise **jamais** pour autant à inventer des points.

Un modèle « exécuté » n’est pas forcément « noté » : la réponse peut manquer de sous-critères ou demander un arbitrage humain. L’interface différencie donc les évaluations notées, les propositions nécessitant une revue, les sorties incomplètes et les échecs techniques. Les erreurs détaillées restent **dans l’inspecteur local** ; le rapport exporté ne contient que des catégories fixes ne divulguant ni URL de serveur, ni clé, ni réponse brute.

Si aucun verdict n’a été obtenu, la **justesse est non mesurable**, et non « 0 % d’exactitude ». Si des verdicts ont été obtenus, la justesse stricte est calculée sur tous les attendus référencés ; les abstentions ne valent jamais une bonne décision. La couverture indique séparément combien de décisions ont été produites. Un seul passage, même parfaitement uniforme, **ne constitue pas** une preuve de répétabilité.

Les verdicts générés à partir de **texte transcrit** restent impropres à établir seuls des propriétés purement visuelles (centrage, occupation de page, traits, alignement des légendes) : pour ces points, une évaluation sur l’image originale et la vérification de l’enseignant sont indispensables. Aucun ancien résultat n’est réinterprété automatiquement : relancer le protocole pour produire un nouvel export, car le rapport précédent n’inclut pas les traces brutes nécessaires.

## Troisième méthode : Vision + Décisionnel direct (System One)

La méthode de correction enregistrée `visual-decision` est un **nouveau choix explicite** à côté de `generative` et `decision`. Elle transmet la/les images de la copie et les questions fermées issues du barème en **une seule requête** à l’API native Ollama `POST /v1/systemone` : pas de lecture/transcription préalable, aucun second modèle OCR ni repli automatique vers `/api/chat`. Une seule requête peut contenir au maximum 64 questions ; les photos sont préparées localement et les octets ne figurent pas dans les traces exportées.

**Compatibilité à ne pas confondre avec l’architecture du modèle :** Ollama 0.35+ accepte des images System One uniquement pour l’encodage `clef` (modèles `clef-flash` 9B ou `clef` 27B). Les profils D1/D3 conservent leur parcours visuel expérimental historique. **TEV1 4B n’accepte pas le champ `images` via System One** : le code officiel renvoie « image inputs are not supported by this decision model ». La famille Qwen3.5 sous-jacente ne rend pas ce chemin API multimodal. Le mode existant « Décisionnelle — Vision puis System One texte » reste le bon choix pour TEV1 ; le sélecteur direct avertit et refuse TEV1 avant toute requête.

La méthode est persistée dans les profils, utilisable depuis l’évaluateur de schémas et depuis le parcours enseignant avec un barème unique. Les choix visuels sont **provisoires**, sans preuve textuelle localisée ; la vérification humaine demeure obligatoire. La note n’est pas déduite si la proposition est incomplète. Un modèle Clef-Flash 9B peut dépasser les capacités de postes à faible RAM : aucune promesse de performance n’est faite sans mesure sur la machine cible.

Références officielles : https://github.com/ollama/ollama/blob/main/decision/systemone.go ; https://ollama.com/library/tev1:4b ; https://ollama.com/library/clef-flash .


## Révision de la référence B — 8 novembre 2026

L’image intégrée est identique au dessin fourni pour revue. La cible initiale de 5/10
était trop sévère sur plusieurs observations : départs des cellules voisines
visibles aux coins, légendes globalement horizontales et composition lisible.
La couleur n’est pas interdite par le barème et ne constitue pas une pénalité en soi.

La nouvelle référence est une **proposition de revue visuelle, pas une validation
par un enseignant**. Les points partiels sont des appréciations ; 7,36/10 correspond
à leur somme explicite, pas à une précision pédagogique démontrée.

| Catégorie | Points proposés |
| --- | ---: |
| Qualité du dessin | 3,02 / 4 |
| Titre | 0,67 / 2 |
| Légendes | 1,67 / 2 |
| Compréhension selon les quatre attendus actuels | 2 / 2 |
| Total | 7,36 / 10 |

Les 19 justifications sont consultables dans la carte B et exportées dans
`referenceReview`. Proportions, propreté, occupation de page et centrage restent
à confirmer. Le titre ne mentionne pas de coupe : zéro selon la règle actuelle,
mais son applicabilité à cet exercice doit être décidée par le professeur.
La plaque cellulaire dessinée satisfait le contrat existant de télophase ; cela
ne certifie pas la représentation détaillée du phragmoplaste.

Le rapport passe à la version 2 et au protocole `scientific-diagram-generated-a-b-c-v2`.
Les anciens exports restent inchangés : ne pas comparer leurs pourcentages d’accord
avec les nouveaux sans recalcul explicite sur une même référence. A et C conservent
leurs cibles provisoires, non réévaluées dans cette revue. Aucun prompt de correction,
barème, modèle, image ni point prédit n’est modifié par cette calibration.
