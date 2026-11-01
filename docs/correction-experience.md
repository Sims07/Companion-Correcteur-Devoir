# Expérience de correction : priorité au temps enseignant

## Principe produit non négociable

**La correction générée doit être nettement plus rapide à lire que la copie originale.** L'application n'a pas pour objectif de produire un second devoir, ni un rapport académique destiné à un autre correcteur. Elle doit aider un enseignant expert de sa discipline à prendre rapidement des décisions fiables.

Chaque évolution de l'interface, du domaine, des prompts, des modèles et de la restitution doit répondre à cette question :

> Cette information aide-t-elle réellement l'enseignant à décider plus vite ou plus sûrement ? Si non, elle ne doit pas occuper l'espace principal de correction.

Ce principe s'applique à toutes les disciplines, avec une attention particulière aux exigences de rigueur scientifique des corrections universitaires en biologie.

## Modèle de lecture : les exceptions d'abord

Le parcours normal de correction doit mettre en évidence les éléments qui méritent une attention humaine, plutôt que dérouler toutes les explications produites par le modèle.

- **À examiner en premier :** points retirés, réponse partielle ou incorrecte, preuve absente, transcription incertaine, confiance faible, question explicite à l'enseignant, ambiguïté susceptible de changer la note.
- **Sans alerte :** résultat complet, étayé et de confiance élevée. Il est retenu par défaut et reste visible dans le récapitulatif ; aucune confirmation n'est demandée.
- **Toujours possible :** afficher tous les critères et ouvrir chaque justification, même lorsqu'elle n'est pas présentée par défaut.

Une déduction n'est jamais masquée comme un résultat banal : tout critère noté sous son maximum appartient à la liste des éléments à examiner. Une incertitude ou une preuve manquante reste prioritaire, même si la note proposée est maximale.

## Trois niveaux d'information

1. **Lecture immédiate (par défaut)** : note proposée, points par critère, raison courte de chaque alerte, justification en une phrase et commentaire à reporter lorsqu'il existe. Les critères sans alerte restent regroupés avec leur preuve courte (12 mots maximum).
2. **Détail à la demande** : preuve complète, ventilation des schémas, repère de page et question ou texte long. Ces détails restent repliés.
3. **Diagnostic IA** : sorties brutes, prompts, confiance, comparaison de modèles, timings, stratégies expérimentales et arbitrage. Ces informations restent dans les espaces de diagnostic/observabilité et ne polluent pas l'interface enseignante.

## Règles de rédaction des résultats

- Une justification explique le fait décisif qui motive la note, en une phrase courte (cible : 18 mots maximum).
- Une preuve cite uniquement le fragment minimal utile, fidèle à la copie (cible : 12 mots maximum).
- Ne jamais paraphraser la réponse entière, recopier le barème ou raconter le raisonnement interne du modèle.
- Pour une réponse correcte, une confirmation très brève suffit.
- Pour une réponse partielle, nommer uniquement l'élément manquant ou incorrect.
- Pour une réponse incorrecte, nommer précisément l'erreur déterminante.
- Pour une absence, signaler ce qui manque sans inventer de preuve.
- Pour une ambiguïté, formuler une question concrète dont la réponse peut modifier la note.
- Pour une confiance faible ou une lecture illisible, demander une vérification humaine ; ne jamais transformer un doute de lecture en erreur scientifique.
- Un commentaire pédagogique destiné à être reporté sur la copie est distinct de la justification. Il est attendu lorsqu'une remarque concrète est utile ; il peut rester vide pour une note maximale de confiance élevée.
- Pour une note maximale avec confiance élevée, rationale peut être une chaîne vide ; evidence reste obligatoire et non vide.
- Les limites 18/12/12 mots sont mesurées sur le texte original du modèle, sans troncature ; les dépassements doivent rester visibles dans les diagnostics.

Ces limites de longueur sont des objectifs de lisibilité, pas une autorisation de supprimer une nuance nécessaire à la décision. La fidélité à la copie et au barème prime toujours.

## Actions humaines et sécurité de notation

- La proposition de l'IA est retenue par défaut dès que l'analyse complète est terminée : aucune validation critère par critère ou confirmation groupée n'est requise pour poursuivre.
- Cette acceptation par défaut est un état de travail, pas une publication ni une communication automatique de la note à l'étudiant. Le professeur reste libre de modifier les points et commentaires avant de reporter la note sur la copie.
- Les points retirés, les preuves manquantes, les faibles confiances et les ambiguïtés restent signalés visuellement et prioritaires à la lecture, sans bloquer l'accès à la copie suivante.
- L'enseignant peut toujours afficher tous les critères, modifier les points et saisir un commentaire ; ces actions ne doivent jamais être imposées.
- Une correction active privilégie les exceptions ; une correction archivée affiche tous les critères par défaut.
- Le calcul des totaux, plafonds et cohérences reste déterministe côté application, jamais délégué au texte explicatif du modèle.

## Principes d'interface

- Donner la priorité visuelle à la note et aux décisions en attente, pas aux paragraphes explicatifs.
- Ne pas afficher en permanence les preuves, justifications, commentaires suggérés et ventilations détaillées.
- Conserver la copie originale comme source de vérité et rendre les preuves localisables sur la page.
- Signaler clairement les critères à examiner et le nombre de critères sans alerte.
- Permettre d'ouvrir tous les critères sans perdre les modifications déjà effectuées.
- Les libellés doivent être compréhensibles par un professeur, sans vocabulaire de laboratoire IA.
- Le mode Diagnostic IA reste séparé du parcours enseignant.

## Mesure de réussite

Une évolution de la correction doit être évaluée selon :
- le temps nécessaire pour comprendre la proposition et finaliser une copie ;
- le nombre de mots affichés avant interaction, comparé au volume de la copie (texte utile des critères : titres, scores, raisons, justifications et commentaires, hors navigation) ;
- le nombre de critères, le nombre de critères à examiner, le nombre confirmés en groupe et le nombre ensuite modifiés par l'enseignant ;
- le taux de modification des critères confirmés en groupe ;
- le taux de corrections humaines des propositions et les erreurs détectées ;
- la capacité à retrouver rapidement la preuve originale d'une décision.

Le succès n'est pas la quantité de texte générée ni le nombre de justifications affichées. C'est la réduction du temps de lecture et de décision, sans perte de fiabilité pédagogique.

## Exigences de tests

Toute modification liée à cette expérience doit couvrir :
- les règles de domaine qui classent les critères sans alerte et les exceptions ;
- l'acceptation par défaut des propositions, la conservation des alertes et l'absence de blocage lors du passage à la copie suivante ;
- les contrats de prompt et les bornes de concision ;
- le contrat UI (détails repliés par défaut, alertes visibles, accès à tous les critères) ;
- le parcours navigateur de revue facultative des exceptions et d'ajout immédiat d'une copie suivante, sans confirmation obligatoire.

Respecter la pyramide : tests unitaires du domaine d'abord, intégration des adaptateurs ensuite, puis un nombre ciblé de tests Playwright pour les parcours réels. Les tests ne doivent pas dépendre d'une formulation complète fragile lorsque le comportement sémantique peut être vérifié autrement.


## Correction individuelle et correction en série

Le parcours enseignant propose deux façons d'alimenter le même moteur de correction :

- **Correction individuelle** : l'enseignant ajoute une copie, suit sa correction et peut immédiatement passer à une autre copie sans attendre de validation ou de fermeture de la précédente.
- **Correction en série** : l'enseignant choisit comment regrouper les fichiers : soit un fichier sélectionné correspond à une copie, soit plusieurs fichiers sélectionnés constituent ensemble les pages d'une seule copie. Dans le second cas, chaque nouvelle sélection ajoute un nouveau groupe (une nouvelle copie). Un PDF multipage reste un seul fichier dont les pages restent groupées. La préparation des groupes est séquentielle pour limiter les pics de mémoire dans le navigateur.

Les deux modes utilisent la même file persistée et le même ordonnanceur. Les copies sont traitées séquentiellement, dans leur ordre d'ajout, sans lancer plusieurs générations en parallèle. Une copie prête à réviser ou nécessitant une intervention humaine ne bloque jamais le traitement des suivantes.

Le suivi doit rendre le traitement explicite : nombre de copies terminées, en cours et en attente ; copie active ; étape de lecture ou d'analyse ; progression des pages et critères ; erreurs et action de reprise. La file est un outil de suivi, pas une étape administrative à valider pour autoriser la suite.

Les fichiers et images restent préparés et conservés localement ; seul le contenu nécessaire à l'inférence est transmis au fournisseur configuré par l'enseignant. Le mode série ne doit jamais changer silencieusement la configuration du fournisseur.

### Contrats de tests du mode série

- En mode « un fichier = une copie », chaque fichier sélectionné produit un job distinct.
- En mode groupé, tous les fichiers d'une même sélection produisent un seul job, avec toutes leurs pages dans l'ordre de sélection.
- Chaque nouvelle sélection en mode groupé crée un nouveau job indépendant.
- Les pages issues d'un même PDF restent dans le job correspondant au fichier sélectionné.
- La préparation des fichiers est séquentielle ; une erreur de préparation ne doit pas créer un job vide.
- Le traitement des jobs reste séquentiel et la revue humaine d'un job terminé ne bloque pas les suivants.


### Choix explicite du parcours enseignant

À l'étape « Ajouter une copie », le professeur choisit explicitement entre deux parcours visuellement distincts :

- **Correction individuelle** : conserve l'écran de préparation d'une seule copie, son aperçu, puis le bouton « Corriger ». Le professeur garde la main sur le passage à la copie suivante.
- **Correction en série** : remplace cet écran par une session dédiée. Le professeur choisit entre un fichier par copie et un groupe de plusieurs fichiers par copie ; chaque nouvelle sélection groupée ajoute un étudiant distinct. Il visualise les compteurs (terminées, en cours, en attente, à vérifier), suit l'état de chaque copie et peut ouvrir une correction prête ou reprendre une copie en erreur.

Le choix est réversible à tout moment. Les deux parcours partagent le barème, les réglages du fournisseur et le moteur séquentiel. La correction individuelle n'affiche pas les commandes de mise en file d'arrière-plan ; celles-ci appartiennent au parcours en série.
