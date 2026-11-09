# Protocole de sensibilité sémantique des schémas scientifiques

## Pourquoi cette suite distincte de D/E ?

D/E teste les **traits de rappel de légende** dans une mitose. Cela ne mesure pas les **flèches de processus**, les **connexions biologiques** ou l'**appartenance d'une structure à un compartiment**.

La suite S0–S5, accessible dans **Outils IA → Évaluation des modèles → Schémas scientifiques → Tester la compréhension sémantique**, est un laboratoire **facultatif**. Elle ne change ni le barème enseignant, ni la correction réelle.

## Protocole contrôlé

Tous les dessins contiennent exactement les mêmes mots (ADN, ARN, Protéine, Cellule, Noyau) et utilisent un barème commun de **3 attendus indépendants** :

- la flèche orientée ADN vers ARN ;
- la flèche orientée ARN vers Protéine ;
- le noyau dessiné **à l'intérieur** du contour cellulaire.

| Dessin | Mutation | Référence provisoire |
| --- | --- | --- |
| S0 | Témoin, toutes les relations correctes | 3/3 |
| S1 | Inversion de la première flèche | 2/3 |
| S2 | ADN relié à Protéine, plutôt qu'à ARN | 2/3 |
| S3 | Noyau (et ADN) hors du contour cellulaire | 2/3 |
| S4 | Disposition verticale, relations conservées | 3/3 |
| S5 | Première flèche sans pointe discernable | Note de référence **non définie** ; enseignant requis |

Les six SVG sont générés dans le navigateur, convertis **en PNG localement**, puis soumis au pipeline d'évaluation habituel. **Aucune réponse de référence, aucun identifiant de variante ni score ne sont transmis au modèle**. Les attendus du barème restent transmis comme dans une correction normale, ce n'est donc **pas** encore une lecture à l'aveugle.

La série fonctionne avec les profils et méthodes déjà proposés dans ce laboratoire, y compris Think si le modèle Ollama local le supporte. Un passage est proposé par défaut ; les répétitions 3/5 sont destinées à mesurer la stabilité. Des modèles distants ne sont utilisés que si l'utilisateur les sélectionne explicitement.

## Interpréter les métriques

- **Mutations détectées** : pour S1/S2/S3, la relation doit être reconnue présente dans S0 **et** absente dans la variante fautive, au même numéro de répétition et pour le même modèle/méthode.
- **Non mesurables** : témoin absent, réponse indécidable, variante/répétition manquante ; on n'assimile pas cela à un échec scientifique.
- **Faux positifs témoins** : une relation correcte de S0 ou S4 est jugée absente ou partielle.
- **Disposition préservée** : chaque attendu doit être reconnu présent sur S0 et S4.
- **Abstentions** : décision indécidable ou absente ; S5 sert à tester explicitement l'incertitude, pas à imposer une note.

La note seule ne démontre pas que le sens d'une flèche a été vu. **Aucun test automatisé ne prétend valider la qualité d'un vrai modèle** : les tests navigateur simulent le fournisseur IA. Les images, clés, URLs d'API, prompts et sorties brutes ne figurent pas dans le JSON exporté.

## Lot 2 : comparer deux stratégies de lecture

Dans la suite de sensibilité, choisir **Stratégie de vérification visuelle** :

- **Standard** : correction en un appel avec les attendus du barème.
- **Questions ciblées** : même appel et même barème ; la consigne demande explicitement de suivre chaque trait, localiser la pointe, vérifier la connexion et l'appartenance à un contour *avant de noter*.
- **Comparer standard / questions ciblées** : les six PNG sont préparés une seule fois, puis réutilisés pour les deux séries. Le rapport version 2 conserve `promptMode` par cas et par statistique.

Le guidage est un **test de prompt**, pas une extraction indépendante : le modèle reçoit encore le barème et peut continuer à halluciner une relation. Il faut donc comparer les taux de mutations détectées et de faux positifs **par mode**, mais aussi le temps total et les abstentions. Aucune amélioration n'est présumée avant les tests réels.


## Lot 3 : extraction indépendante sans barème (expérimental)

Dans le même parcours, ouvrir **Observer un graphe de relations avant le barème (Ollama local)**.

Contrairement aux deux stratégies de notation directe, le modèle Vision reçoit **seulement** une image et une instruction générale : copier les étiquettes présentes, observer les extrémités et pointes des flèches, et relever les inclusions de contours. Le prompt ne contient **ni ADN, ni ARN, ni relations attendues, ni consigne de correction, ni barème**.

Le résultat JSON est strictement contrôlé et converti en trois décisions par un **comparateur déterministe** indépendant du modèle :

- ADN → ARN : la pointe doit aboutir réellement à ARN, sinon `absent` si une inversion est observée, `uncertain` si la pointe n'est pas discernable ;
- ARN → Protéine : même principe ;
- Noyau dans Cellule : un contour observé `inside` vaut présent, `outside` vaut absent, le manque d'observation reste incertain.

Quand aucune flèche n'unit les deux éléments demandés, on ne considère la relation absente que si l'extraction indique avoir relevé toutes les flèches ; **ce booléen est une affirmation du modèle, pas une garantie**. Les autres observations restent indécidables.

Cette approche nécessite un profil Ollama **strictement local** (HTTP loopback, sans proxy ou clé API), configuré avec un modèle Vision. Aucun appel vers une API compatible distante n'est possible depuis ce parcours ; l'IA est déchargée de la RAM après chaque appel. Les six cas S0–S5 sont évalués séquentiellement, avec 1, 3 ou 5 répétitions. Le rapport exporte les décisions et métriques mais **ni image, ni prompts, ni graphe brut, ni URL serveur, ni clé**. Il reste accessible après navigation vers l'inspecteur réseau.

**Limites importantes :** l'absence de barème au premier appel réduit le risque de reconstruction d'un schéma attendu, mais n'empêche pas un modèle d'halluciner une relation. La comparaison est validée avec des réponses mockées en CI ; elle n'établit pas encore un gain réel sur Qwen ou d'autres modèles. Il n'y a pas de second appel de recadrage dans cette première version : tester ensuite, sur les seuls détails incertains, un agrandissement qui inclut **la flèche complète** (départ, trajet, pointe, arrivée), en mesurant son coût et ses faux positifs.

## Prochaines expériences

1. Extraction **sans barème** d'un graphe de relations (départs, pointes, inclusions, nombres), comparaison ensuite avec le corrigé validé par l'enseignant.
2. Agrandissement conditionnel du détail **complet** (départ, trajet et pointe), uniquement quand une relation est ambiguë.

La suite S0–S5 fournit un point de référence commun pour mesurer les gains réels de ces méthodes. Les références restent à valider avec un enseignant de biologie, notamment le cas S5.
