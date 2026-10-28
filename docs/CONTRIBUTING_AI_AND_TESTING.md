# Règles de contribution et de collaboration avec l’assistant IA

Ce document définit les règles à respecter pour toute évolution de Companion Correcteur Devoir, qu’elle soit réalisée par un développeur ou avec l’aide d’un assistant IA. Il sert de référence persistante entre les sessions de travail.

## 1. Workflow GitHub obligatoire

- Toute modification du code ou de la documentation passe par une branche dédiée et une Pull Request (PR).
- Ne pas considérer une modification comme terminée simplement parce que le code a été écrit ou commité.
- Attendre que les contrôles CI pertinents soient terminés et **verts sur le dernier commit de la PR** avant d’annoncer que le travail est validé.
- Si un test ou un contrôle échoue, examiner les logs, corriger le problème sur la branche concernée, puis attendre le résultat de la nouvelle exécution.
- Ne jamais annoncer que les tests passent sur la base d’une exécution ancienne, d’un résultat encore en cours ou d’une supposition.
- Ne pas fusionner une PR sans instruction explicite du responsable du projet.
- Dans les comptes rendus, distinguer clairement ce qui est modifié, ce qui a été testé, ce qui reste en cours et ce qui est effectivement validé.

## 2. Chaque changement doit être couvert par des tests

- Toute modification fonctionnelle ou structurelle doit inclure les tests qui la couvrent dans la même PR.
- Ajouter les tests au moment du changement, et non dans une étape ultérieure oubliée.
- Choisir le type de test selon le comportement ou la propriété réellement vérifiés, pas selon le fichier où le test est placé.
- Privilégier des tests robustes et utiles qui vérifient le comportement observable. Les assertions sur le texte du code source peuvent servir de garde-fous ciblés, mais ne remplacent pas des tests d’exécution lorsqu’un comportement peut être testé directement.
- Ne pas affaiblir ou supprimer des tests existants uniquement pour faire passer la CI. Toute modification d’un test existant doit rester justifiée par le comportement attendu.

## 3. Pyramide de tests

Respecter la pyramide de tests : beaucoup de tests unitaires rapides, des tests d’intégration ciblés, puis un nombre plus limité de tests de bout en bout lorsque cela apporte une réelle valeur.

- **Tests unitaires** : vérifier une fonction, une règle métier ou un composant isolé avec ses dépendances contrôlées.
- **Tests d’intégration** : vérifier les interactions entre plusieurs composants, ports, adaptateurs ou systèmes intégrés.
- **Tests de bout en bout (E2E)** : vérifier un parcours utilisateur complet, de manière ciblée, pour les scénarios critiques.
- **Tests d’interface** : pour un comportement React, tester si possible le rendu, les interactions, l’état accessible et les changements visibles plutôt que seulement la présence de chaînes dans le fichier source.
- Choisir le niveau le plus simple qui prouve correctement la propriété ; ne pas transformer chaque vérification en test E2E.

## 4. Les tests d’architecture ont un périmètre précis

Les tests d’architecture ne sont pas des tests fonctionnels ou des tests d’interface.

Dans ce projet, ils doivent notamment vérifier que l’architecture hexagonale est respectée et que les règles de dépendances entre les couches sont préservées.

Exemples de responsabilités adaptées aux tests d’architecture :
- empêcher le domaine de dépendre de détails d’infrastructure ou d’adaptateurs ;
- contrôler le sens autorisé des dépendances entre domaine, ports, cas d’usage et adaptateurs ;
- détecter les imports interdits et les régressions de frontières entre couches.

Exemples qui **ne sont pas** des tests d’architecture :
- vérifier que la vue enseignant est sélectionnée par défaut ;
- vérifier qu’un bouton change le mode d’interface ;
- vérifier qu’un panneau Ollama est visible ou masqué ;
- vérifier qu’un texte d’accueil change selon l’état de l’interface.

Ces derniers relèvent des tests unitaires, de composants ou d’interface, selon leur implémentation.

**Règle impérative : ne pas ajouter des tests de comportement UI dans `tests/architecture.test.ts` simplement parce que ce fichier existe déjà.** Créer ou utiliser un fichier de tests adapté au sujet testé.

## 5. Critères de validation d’une PR

Avant de déclarer une PR validée, vérifier au minimum :
- le typecheck ;
- la suite de tests ;
- les contrôles de couverture configurés dans le dépôt ;
- le build ;
- les autres contrôles CI pertinents pour les fichiers modifiés.

La validation doit porter sur le commit le plus récent de la branche. Si un nouveau commit est poussé après un résultat vert, attendre les contrôles correspondant à ce nouveau commit.

## 6. Principes propres au projet

- Préserver l’architecture hexagonale et ses règles de dépendance.
- Maintenir la séparation entre l’interface destinée aux enseignants et les outils de diagnostic technique de l’IA lorsque ces deux modes sont concernés.
- Préserver la confidentialité des copies : favoriser le traitement local via Ollama lorsque configuré et ne pas envoyer de copies vers un service cloud sans décision explicite et transparente de l’utilisateur.
- L’IA assiste l’enseignant ; elle doit signaler ses incertitudes et demander des précisions quand nécessaire. Le professeur garde la maîtrise du barème et de la décision finale.
- Toute évolution de ces comportements doit être couverte par des tests adaptés.

## 7. Compte rendu de fin de travail

Un compte rendu doit donner :
1. le lien de la PR ;
2. les changements principaux ;
3. les tests ajoutés ou adaptés et ce qu’ils vérifient ;
4. l’état réel des contrôles CI sur le dernier commit ;
5. les éventuels points non validés ou risques restants.

Ne jamais utiliser « terminé », « validé » ou « tout est bon » tant que les vérifications exigées ne sont pas vertes. Si la CI est encore en cours, le dire explicitement.
