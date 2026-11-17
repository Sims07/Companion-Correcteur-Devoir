# Vérifier et clarifier le barème

La préparation du barème comporte une vérification **facultative** par un modèle génératif **Ollama local**. L'application envoie uniquement les intitulés, descriptions, identifiants et points du barème. Aucune photo de copie ou donnée étudiante n'est nécessaire à l'audit.

## Parcours enseignant

1. Définir et valider la structure du barème.
2. Lancer « Vérifier avec l'IA locale ». Les questions sont classées par impact potentiel sur la notation ; trois sont affichées en premier.
3. Répondre à chaque question avec une option ou une formulation libre, ou choisir « Conserver le barème actuel ».
4. Cliquer sur « Appliquer les précisions validées » pour faire évoluer le barème. Aucune réponse n'est appliquée implicitement.

Les réponses restent enregistrées en local, associées à la signature du barème. Une modification du contenu rend l'audit précédent obsolète et nécessite une nouvelle vérification.

## Versionnement

L'application conserve les deux versions, avant et après les clarifications, ainsi que les décisions et le modèle utilisé. Ces archives sont conservées dans le stockage local du navigateur sous une clé propre à chaque devoir. Les anciens barèmes sont consultables côte à côte, sans écraser les notes déjà archivées.

Les décisions sont ajoutées à la **description** du critère ou sous-critère ciblé. Ni l'intitulé initial, ni les identifiants, ni les points ne changent. Le professeur peut continuer à ajuster son barème dans l'éditeur classique.

## Limites et sécurité

Un audit valide la **clarté du texte** et non la capacité du modèle à lire la photographie. Un résultat « aucune ambiguïté » ne garantit pas la qualité de la correction. Les règles non observables ou incertaines restent du ressort du professeur. L'audit ne contacte jamais un fournisseur distant : l'adresse du serveur doit être une adresse loopback locale.

Lors de la correction, la version active du barème est utilisée. Les versions déjà archivées des copies restent disponibles, et une copie peut être recorrigée avec la nouvelle version sans écraser l'ancienne.


Compare: after applying teacher decisions, the panel immediately displays a
"Barème modifié · version active" summary with each affected criterion, its
previous description and the exact text added. This survives page reload.
Older versions remain available as human-readable before/after comparisons;
raw JSON is optional. If the teacher manually changes the rubric afterward,
the panel clearly distinguishes the current rubric from archived versions.
