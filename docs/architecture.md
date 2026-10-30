# Architecture logicielle — Companion Correcteur de devoirs

## Objectif et contraintes

L'application aide les enseignants universitaires en biologie à analyser des copies manuscrites à partir d'un barème. La confidentialité est une contrainte d'architecture : les images sont préparées dans le navigateur et les requêtes IA sont envoyées uniquement à l'endpoint Ollama configuré. Aucun basculement silencieux vers un fournisseur cloud n'est autorisé.

L'application suit une **architecture hexagonale (ports et adaptateurs)** avec dépendances orientées vers le cœur métier. React, IndexedDB, les APIs du navigateur et Ollama sont des détails externes remplaçables.

## Règle de dépendances

```text
                 Adaptateur entrant
                    React / UI
                        |
                        v
              Application / cas d'usage
                        |
                        v
                 Domaine + ports
                  ^             ^
                  |             |
          Adaptateur stockage  Adaptateur IA
               IndexedDB        Ollama
                  |             |
                  +------|------+
                         |
                 APIs du navigateur

Composition root : src/main.tsx
```

Le domaine ne dépend d'aucune autre couche. L'application dépend du domaine et des ports. Les adaptateurs implémentent les ports et peuvent dépendre du domaine. L'UI appelle les services applicatifs et ne doit pas connaître les adaptateurs concrets. `src/main.tsx` est le **composition root** qui assemble les implémentations.

## Couches et responsabilités

### Domaine — `src/domain/`

Contient les concepts et règles métier : barème, proposition de notation, critères révisés, archives locales, mémoire de décisions, empreinte du barème et classement des retours pertinents. Le domaine ne doit importer ni React, ni IndexedDB, ni `window`/`document`, ni Ollama, ni les adaptateurs. Les règles métier doivent rester déterministes et testables sans navigateur lorsque c'est possible.

### Ports — `src/ports/`

Définit les contrats requis par le cœur, sans implémentation technique. `aiProvider.ts` décrit les capacités IA (lecture visuelle, analyse, diagnostic) ; `localCorrectionRepository.ts` décrit les opérations de persistance des corrections et de la mémoire. Les contrats ne doivent pas exposer de types IndexedDB.

### Application — `src/application/`

Contient les cas d'usage et l'orchestration. `localCorrectionService.ts` valide les commandes de persistance et délègue au port de stockage. `correctionWorkspaceService.ts` orchestre les opérations de préparation/import, l'accès au fournisseur IA et les fichiers. Les cas d'usage ne doivent pas importer de code de `src/adapters/`, React ou des APIs du navigateur. Les invariants métier appartiennent au domaine, pas aux composants UI.

### Adaptateurs — `src/adapters/`

- `storage/indexedDbMemory.ts` implémente le port `LocalCorrectionRepository` au moyen d'IndexedDB. Il conserve les archives de correction et les entrées de mémoire locale.
- `ai/` contient l'adaptateur Ollama et l'intégration du contexte de mémoire à la frontière des requêtes. Le contexte local est ajouté aux prompts d'analyse de correction, pas à la transcription visuelle.
- `files/` prépare localement les photos et les PDF et importe les barèmes depuis les formats pris en charge.

La mémoire est un rappel local léger fondé sur le recouvrement de termes, pas un moteur vectoriel, un fine-tuning ou un entraînement automatique. Les retours sont associés à une correction et à l'empreinte du barème. Ils peuvent être recherchés dans le périmètre pertinent, mais ne modifient pas silencieusement le barème courant. Les règles ne doivent être réutilisées comme règles de barème que si l'enseignant les a explicitement promues.

### Observabilité locale — `src/domain/observability.ts` et `src/ui/ObservabilityDashboard.tsx`

Les métriques agrègent deux sources locales : les traces du parcours de correction et les évaluations de modèles enregistrées dans IndexedDB. Chaque résultat de profil d'une campagne d'évaluation devient une trace distincte, avec ses modèles Vision/Analyse, ses durées, son statut, sa note proposée et les compteurs de tokens disponibles. Les campagnes Vision seule et Analyse seule ne renseignent que l'étape réellement exécutée. Les valeurs absentes restent distinctes de zéro. L'interface présente une vue d'ensemble commune, des graphiques de durée et de répartition Vision/Analyse, les modèles les plus sollicités et un explorateur distinguant corrections et évaluations. Elle n'affiche jamais les images, transcriptions ou sorties brutes. L'historique agrégé est limité aux 100 dernières exécutions. Cette instrumentation réutilise les données locales existantes ; l'instrumentation fine de chaque opération et l'export OpenTelemetry restent des évolutions séparées.

### Interface — `src/ui/`

Les composants React présentent l'état et traduisent les interactions en appels applicatifs. Ils ne doivent pas importer directement `src/adapters/`, construire de requêtes IndexedDB ou devenir le lieu des règles métier.

L'espace de révision présente deux zones complémentaires :
- **Copie de référence** : pages originales archivées et transcription reconnue, consultable dans une section repliable.
- **Révision de la notation** : synthèse de la proposition, critères, points proposés puis retenus, justifications, preuves et confiance.

Sur grand écran, le panneau source reste visible pendant la révision afin de comparer les affirmations avec le manuscrit. Sur petit écran, les zones s'empilent et le panneau cesse d'être sticky. La progression de la file de copies est séparée des alertes qui nécessitent une décision du professeur.

Le mode Diagnostic IA est distinct du parcours normal de correction. Il sert à comparer les modèles et stratégies, consulter les notes globales et par critère, les sorties et les durées ; les stratégies expérimentales, dont l'arbitre, ne sont pas activées par défaut dans la correction enseignante.

### Composition root — `src/main.tsx`

Seul point d'assemblage des adaptateurs concrets, services applicatifs et composants racine. Il instancie le dépôt IndexedDB, le service de persistance, le fournisseur Ollama et le service de préparation/correction, puis les injecte dans l'interface.

## Flux principaux

1. L'enseignant crée ou sélectionne un devoir, ajuste son barème et choisit entre questions intégrées à la copie ou sujet de référence séparé.
2. Les fichiers sont préparés localement. Les PDF sont rendus en images dans le navigateur ; aucun téléversement de fichier n'est effectué par l'application.
3. L'enseignant configure un modèle de lecture (vision) et un modèle d'analyse/notation. Pour un barème importé depuis une image, le modèle de vision demande une sortie structurée qui est validée et présentée à l'enseignant pour vérification.
4. Le modèle de vision lit les images de la copie. Le texte extrait reste consultable et peut être réutilisé lors d'une nouvelle analyse sans rappeler le modèle de vision. En mode sujet séparé, la transcription du sujet est conservée en mémoire de la session et réutilisée pour les copies suivantes.
5. Le modèle d'analyse propose une note globale et des notes par critère avec justifications, éléments de preuve et confiance. La validation du résultat n'accepte pas automatiquement la proposition : l'enseignant contrôle et ajuste les critères, puis finalise.
6. Une correction finalisée peut être archivée dans IndexedDB avec son instantané de révision, ses images, ses transcriptions, le barème et la proposition. Elle peut ensuite être rouverte pour consultation. Les données restent dans le profil de navigateur ; elles ne sont pas synchronisées entre appareils.
7. Les écarts entre les notes proposées et les décisions de l'enseignant, ainsi que les commentaires explicites, peuvent être mémorisés localement. Le contexte récupéré est consultatif et ne remplace jamais la décision enseignante.
8. La file de copies facilite le passage à la copie suivante pendant une session. Elle ne doit pas être confondue avec un traitement serveur en lot ni avec un service cloud.
9. Le Diagnostic IA permet d'évaluer séparément les modèles et stratégies expérimentales, sans changer le comportement par défaut du parcours de correction enseignant.

## Confidentialité et limites

- Les données sont transmises au seul endpoint Ollama configuré par l'utilisateur. Si cet endpoint est distant, les requêtes et images qu'il reçoit sortent de l'appareil : le caractère local dépend donc de la configuration choisie.
- Les archives, images et retours sont stockés dans IndexedDB du navigateur et peuvent être supprimés avec les données du site. Ce stockage n'est ni chiffré par l'application ni synchronisé.
- La transcription du sujet de référence est en mémoire de page et n'est pas un dossier persistant partagé entre appareils.
- La confiance déclarée par un modèle n'est pas calibrée statistiquement. Les preuves et justifications générées doivent être comparées à la copie originale.
- Les performances de lecture manuscrite varient selon le modèle et la qualité des images.

## Tests et garde-fous d'architecture

La pyramide de tests attendue est :

1. **Unitaires** : domaine et cas d'usage avec ports simulés, sans React ni APIs navigateur lorsque possible.
2. **Intégration** : adaptateurs avec APIs simulées, notamment IndexedDB via `fake-indexeddb` et appels HTTP simulés.
3. **Interface et parcours** : tests de contrat de structure/styles UI et parcours Playwright dans Chromium pour les interactions réelles, dont la réouverture d'une correction et l'adaptation desktop/mobile.

Les tests d'architecture vérifient les frontières d'import : le domaine n'importe aucune couche externe ; l'application ne dépend que du domaine et des ports ; l'UI n'importe pas les adaptateurs ; les adaptateurs ne dépendent pas de l'UI ou de l'application ; seul le composition root assemble les implémentations. Toute nouvelle dépendance inter-couche doit être justifiée et couverte par ces tests.

Commandes de validation :

- `npm run typecheck` — vérification TypeScript.
- `npm test` — tests unitaires, d'intégration et de contrat.
- `npm run test:coverage` — rapport de couverture global.
- `npm run test:coverage:core` — rapport ciblé sur domaine et application.
- `npm run build` — compilation et build de production.
- `npm run test:e2e` — parcours Playwright.

La CI du dépôt exécute le typecheck, Vitest, les deux rapports de couverture, le build et les tests Playwright sur les pull requests.

## Limites connues

- Ollama doit être accessible depuis le navigateur ; une configuration CORS peut être nécessaire.
- Un modèle de vision est requis pour analyser des images.
- La qualité de transcription varie avec le modèle et la photo.
- Les photos, transcriptions et corrections archivées ne forment pas encore un dossier de devoir synchronisé ou exportable entre appareils.
- Le rappel local est lexical et limité au contexte de correction/barème ; il ne constitue pas un apprentissage automatique du modèle.
