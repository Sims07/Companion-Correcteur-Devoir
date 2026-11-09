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

Dans le même parcours, ouvrir **Observer un graphe de relations avant le barème (Ollama ou OpenAI-compatible)**.

Contrairement aux deux stratégies de notation directe, le modèle Vision reçoit **seulement** une image et une instruction générale : copier les étiquettes présentes, observer les extrémités et pointes des flèches, et relever les inclusions de contours. Le prompt ne contient **ni ADN, ni ARN, ni relations attendues, ni consigne de correction, ni barème**.

Le résultat JSON est strictement contrôlé et converti en trois décisions par un **comparateur déterministe** indépendant du modèle :

- ADN → ARN : la pointe doit aboutir réellement à ARN, sinon `absent` si une inversion est observée, `uncertain` si la pointe n'est pas discernable ;
- ARN → Protéine : même principe ;
- Noyau dans Cellule : un contour observé `inside` vaut présent, `outside` vaut absent, le manque d'observation reste incertain.

Quand aucune flèche n'unit les deux éléments demandés, on ne considère la relation absente que si l'extraction indique avoir relevé toutes les flèches ; **ce booléen est une affirmation du modèle, pas une garantie**. Les autres observations restent indécidables.

Cette approche accepte un profil Ollama **strictement local** (HTTP loopback sans proxy) ou un profil Vision **OpenAI-compatible explicitement sélectionné** (HTTPS pour un serveur distant, clé API du profil transmise dans le header Authorization). Une sélection Ollama locale ne déclenche jamais de basculement implicite vers le cloud. Avec un profil distant, les six images synthétiques sont effectivement transmises au service sélectionné ; ne pas utiliser de copies privées sans autorisation. La libération mémoire Ollama n'est applicable qu'au mode local. Les six cas S0–S5 sont évalués séquentiellement, avec 1, 3 ou 5 répétitions. Le rapport version 2 distingue le fournisseur (`provider`) et le transfert distant (`remote`, `localOnly`) ; il exporte les décisions et métriques, le **graphe extrait**, les **explications du comparateur** et la **réponse brute du modèle** (limitée à 24 000 caractères, avec indicateur de troncature). Il exclut les images, prompts, URLs serveur et clés de configuration. Ce diagnostic porte uniquement sur les six dessins synthétiques intégrés. Il reste accessible après navigation vers l'inspecteur réseau.

**Limites importantes :** l'absence de barème au premier appel réduit le risque de reconstruction d'un schéma attendu, mais n'empêche pas un modèle d'halluciner une relation. La comparaison est validée avec des réponses mockées en CI ; elle n'établit pas encore un gain réel sur Qwen ou d'autres modèles. Il n'y a pas de second appel de recadrage dans cette première version : tester ensuite, sur les seuls détails incertains, un agrandissement qui inclut **la flèche complète** (départ, trajet, pointe, arrivée), en mesurant son coût et ses faux positifs.

## Prochaines expériences

1. Extraction **sans barème** d'un graphe de relations (départs, pointes, inclusions, nombres), comparaison ensuite avec le corrigé validé par l'enseignant.
2. Agrandissement conditionnel du détail **complet** (départ, trajet et pointe), uniquement quand une relation est ambiguë.

La suite S0–S5 fournit un point de référence commun pour mesurer les gains réels de ces méthodes. Les références restent à valider avec un enseignant de biologie, notamment le cas S5.

## Juger une extraction (rapport version 2)

Après le test, ouvrir **Décisions observées par schéma**, puis le passage concerné :

- Le tableau affiche la référence, le verdict observé et la raison exacte du comparateur : étiquette manquante, pointe indiscernable, flèches contradictoires, connexion absente avec lecture déclarée complète ou incomplète, inclusion manquante, etc.
- **Graphe extrait** affiche le JSON validé, y compris les noms des extrémités, les pointes et `arrowsComplete`.
- **Réponse brute du modèle** reste consultable même lorsque le JSON est rejeté. L'erreur indique le champ invalide, par exemple `arrows[0].tip`. La fin de génération (`doneReason`) et le nombre de tokens sont affichés si le fournisseur les renseigne. `length` suggère une sortie incomplète ; il ne prouve pas à lui seul la cause d'un rejet.
- Le compteur de sorties valides distingue les rejets techniques des verdicts scientifiques. Une sortie valide peut rester indécidable. Une référence non définie (S5) n'est jamais affichée comme une relation absente.

Exporter **l’analyse du graphe JSON** pour transmettre l'ensemble du diagnostic. Les données restent disponibles après navigation vers l'inspecteur réseau. Les anciens rapports ne contiennent pas rétroactivement ces informations : relancer le protocole avec les mêmes modèles et paramètres. Cette évolution ne modifie ni le prompt, ni les paramètres de génération, ni les références, ni les règles de notation. Les sorties brutes sont du texte non fiable, affiché sans interprétation HTML.

## Vérification du contrat et des pixels (lot fiabilisation)

L'appel Ollama de l'observation indépendante utilise un **schéma JSON contraignant**, avec champs `tip` et `containment[].relation` obligatoires ; le validateur métier continue de rejeter les réponses contradictoires ou incomplètes. Aucun champ omis n'est rempli artificiellement. Le diagnostic exporté conserve les métadonnées du **PNG réellement envoyé** (dimensions, type, longueur et signature), jamais ses pixels ni la connexion. Un test Playwright décode les octets effectivement capturés dans les requêtes Ollama et vérifie que la pointe du témoin reste visible, contrairement au cas délibérément sans pointe. Le rapport n'établit pas à lui seul la fiabilité visuelle du modèle ; la seconde lecture par recadrage reste une expérience distincte.


### Fiabilisation de l’observateur de graphe

La lecture à l’aveugle envoie maintenant le même JSON Schema strict à Ollama et aux API OpenAI-compatibles (l’adaptateur conserve sa stratégie de repli si le fournisseur refuse ce paramètre). Les consignes distinguent une pointe absente (`none`) d’une pointe réellement illisible (`unclear`) et demandent de vérifier les contours même s’ils sont scientifiquement surprenants. Une seule relance avec rappel de format est autorisée si la réponse est invalide ; les échecs réseau ne sont pas relancés, aucune réponse n’est corrigée silencieusement, et un graphe valide mais visuellement faux n’est pas considéré fiable. L’export conserve `attempts` et le premier message de validation (`previousValidationError`) sans inclure de pixels, d’adresse ou de clé.

## Lot expérimental : agrandissement conditionnel des flèches

Le bouton **Tester avec agrandissement ciblé** exécute une variante de l'observation à l'aveugle. Dans cette variante uniquement, le premier modèle peut fournir des rectangles `bounds` normalisés 0–1000 pour des flèches visibles. Le navigateur prépare alors, en local, un PNG agrandi et recadré autour du **trait complet et de ses deux extrémités**. Une nouvelle question envoyée au fournisseur explicitement sélectionné demande uniquement quelle extrémité porte réellement une pointe. Un profil OpenAI-compatible distant reçoit aussi le recadrage ; aucun fallback automatique vers le cloud n'est réalisé. Aucun barème ni corrigé n'est envoyé. Le recadrage ne dépend jamais de la vérité S0–S5 et n'est pas effectué si la localisation manque ou est invalide.

Au plus deux appels complémentaires sont autorisés par schéma. Une réponse invalide, un recadrage trop large ou un modèle qui ne distingue pas la pointe laisse la décision initiale **indécidable**. Les compteurs `diagnostic.zoom` rendent visibles les tentatives, les résolutions et les échecs ; l'export n'inclut pas les pixels du recadrage. Le mode de référence reste strictement identique et le parcours de correction des enseignants n'est pas modifié. La variante est un protocole expérimental, non une amélioration démontrée : vérifier sensibilité, faux positifs, abstentions et temps sur de vrais modèles avant adoption.
