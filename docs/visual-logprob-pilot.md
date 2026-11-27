# Pilote expérimental : décision visuelle par logprobs (v1)

Dans le laboratoire de schémas scientifiques, ouvrir **Décisions visuelles par logprobs · expérimental**.
Sélectionner un profil génératif compatible Responses sur une adresse locale (LM Studio/Bionic ou
autre implémentation compatible). Aucune sélection par nom de modèle. D/E (38 requêtes) par défaut ;
A/B/C/D/E (95 requêtes) ensuite. Seules les images synthétiques intégrées sont utilisées.

Le pilote envoie une question fermée par attendu, avec quatre lettres A/B/C/D. Le budget de sortie
est un token, avec température 1 et top_p 1 afin de ne pas forcer artificiellement une distribution
greedy. Thinking est demandé à none sauf si le profil exige l'omission du paramètre. Un raisonnement
observé, un token non conforme, l'absence de logprobs ou un refus HTTP interrompent l'essai ; les
résultats partiels restent exportables. Le transport est non-streaming, sans store, sans outil, sans
redirection et sans repli sur une API distante. La compatibilité effective dépend du serveur,
de l'engine et de la tokenisation ; elle n'est pas présumée.

Le transport commun au pilote, au radar et à la correction hybride demande au maximum dix
alternatives (`top_logprobs: 10`), conformément à la limite observée sur Bionic.
La couverture peut être moindre qu’avec vingt alternatives ; aucune probabilité absente n’est inventée.

Les alternatives top_logprobs et le token généré sont dédupliqués, les variantes avec espace
agrégées ; seules les masses brutes observées sont affichées. Une alternative manquante reste
inconnue. Une décision dominante doit rester devant le deuxième choix même si toute la masse
non observée lui était attribuée. Cette règle n'est ni un seuil de confiance pédagogique ni une
calibration. Le verdict « indéterminable » et les abstentions ne valent jamais zéro point.

Comparer avec le parcours génératif direct existant sur le même profil, le même barème et
les mêmes cas ; les durées du pilote sont la somme des appels (hors préparation d'images).
Comparer séparément la justesse, couverture, faux positifs, faux négatifs, et le temps mural
de bout en bout. Le test n'utilise aucun corrigé dans les prompts. Les références synthétiques
restent provisoires et ne constituent pas une validation sur de vraies copies.
Le JSON exporté contient uniquement les identifiants de cas/attendus, verdicts, probabilités,
mesures et nom de modèle ; pas d'images, clés, endpoint, prompts, réponses brutes ou notes.

Ce premier lot est isolé du moteur enseignant, du radar et de l'historique persistant.
L'optimisation de cache, les répétitions, la calibration sur copies annotées et le mode hybride
sont des étapes distinctes. Ne pas activer de correction automatique avant validation locale.
