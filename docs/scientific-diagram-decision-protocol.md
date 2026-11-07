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
4. Lancer **3 passages** puis éventuellement **5 passages**. Les images déjà préparées sont réutilisées à l’identique ; modèles et passages exécutés séquentiellement pour ménager la RAM du Mac Intel. Après chaque passage local, la libération des modèles suit le parcours déjà implémenté de l’évaluateur.
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

Cette PR ajoute un **protocole d’évaluation**, pas un nouveau mode de correction en production. Les décisions et temps passent par les moteurs déjà disponibles et l’évaluateur existant. Les annotations de référence restent dans l’état local du panneau pendant la session. Le rapport mesure un seul groupe d’images par série ; une future évolution pourra importer un jeu multi-schémas et calculer une agrégation statistique hors répétitions. La segmentation de structures, le calcul géométrique déterministe (alignement / centrage) et la calibration des probabilités ne font pas encore partie de ce protocole.
