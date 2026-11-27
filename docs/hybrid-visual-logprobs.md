# Correction hybride expérimentale de schémas

Opt-in dans les options avancées d'un profil génératif local compatible Responses. Les sondes utilisent /v1/responses sur le même hôte ; la génération conserve le transport configuré. Aucun nom de modèle
imposé. Le moteur enseignant reste génératif par défaut. Aucun appel distant n'est introduit.
Le mode hybride impose des critères séquentiels et ne change pas le modèle chargé.

Pour chaque critère scientifique direct ayant des sous-critères positifs, une question fermée
par attendu est envoyée au moteur logprobs partagé avec le laboratoire. Seuls des verdicts
« présent » résolus, échantillonnés comme tels, dont la masse brute observée atteint 0,95 pour
chaque attendu, déclenchent une proposition de maximum de points. Ce seuil est un choix
expérimental NON calibré. La proposition est marquée non évaluée, sans preuve inventée, et
exclue du total tant que le professeur ne l'a pas confirmée. Tous les autres critères,
dont ceux sans sous-critères, avec un malus, une déduction, une ambiguïté, ou une réponse
partielle, utilisent le moteur génératif existant, avec ses justifications et zoom si activé.
En cas d'échec technique de logprobs, arrêter les sondes pour cette copie, poursuivre en
génératif sur le même profil. Une annulation ne déclenche aucun repli. Relancer individuellement
un critère en file force une analyse générative complète. Le traitement des annotations de
copie reste inchangé. Aucun seuil ne permet une validation pédagogique automatique.

Le mode ne s'applique pas aux copies textuelles, aux corrections mixtes ou aux évaluations
de modèles. La comparaison à la référence et le gain de vitesse restent à mesurer sur Bionic ;
l'image est envoyée à chaque question fermée, donc le coût de préremplissage peut annuler le
gain de génération. Aucune généralisation avant validation du laboratoire.
