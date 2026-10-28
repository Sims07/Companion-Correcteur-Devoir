# Architecture logicielle — Companion Correcteur de devoirs

## Objectif et contraintes

L'application aide les enseignants universitaires en biologie à analyser des copies manuscrites à partir d'un barème. La confidentialité est une contrainte d'architecture : les images et les données de correction restent dans le navigateur et sont envoyées uniquement au serveur Ollama explicitement configuré. Aucun basculement silencieux vers un fournisseur cloud n'est autorisé.

L'application suit une **architecture hexagonale (ports et adaptateurs)**, avec dépendances orientées vers le domaine. React, IndexedDB, le navigateur et Ollama sont des détails externes remplaçables.

## Règle de dépendances

```text
                 Adaptateur entrant
                  React / UI
                      |
                      v
              Application / cas d'usage
                      |
                      v
             Ports définis côté cœur
                 ^            ^
                 |            |
       Adaptateur stockage  Adaptateur IA
            IndexedDB         Ollama
                 |            |
                 +-----+------+
                       |
              APIs externes du navigateur

Composition root : src/main.tsx assemble les implémentations
```

Les dépendances du code vont vers le cœur : le domaine ne dépend d'aucune autre couche ; l'application dépend du domaine et des ports ; les adaptateurs implémentent les ports et peuvent dépendre du domaine ; l'interface appelle les cas d'usage et ne connaît pas les adaptateurs concrets. `src/main.tsx` est le **composition root** : il assemble les implémentations concrètes et les injecte.

## Couches et responsabilités

### Domaine — `src/domain/`

Contient les concepts et règles métier : barème, proposition de notation, mémoire locale, portée des retours, empreinte du barème et construction du contexte de mémoire. Il ne doit importer ni React, ni IndexedDB, ni `window`/`document`, ni Ollama, ni les adaptateurs. Les fonctions métier doivent rester déterministes et testables sans navigateur lorsque c'est possible.

### Ports — `src/ports/`

Définit les contrats requis par le cœur, sans implémentation technique. `aiProvider.ts` décrit le port de génération IA ; `localCorrectionRepository.ts` décrit les opérations de persistance des corrections et de la mémoire. Les types exposés expriment les besoins métier et ne doivent pas exposer de types IndexedDB.

### Application — `src/application/`

Contient les cas d'usage et l'orchestration. `localCorrectionService.ts` valide les commandes de base et délègue au port de persistance. Les cas d'usage ne doivent pas importer de code de `src/adapters/`, React ou des APIs du navigateur. Les règles de notation et les invariants complexes appartiennent au domaine, pas aux composants UI.

### Adaptateurs — `src/adapters/`

- `storage/indexedDbMemory.ts` implémente la persistance locale via IndexedDB et expose `IndexedDbLocalCorrectionRepository`, adaptateur du port `LocalCorrectionRepository`.
- `ai/` contient l'adaptateur Ollama et l'intégration du contexte local à la frontière des requêtes. Le contexte n'est ajouté qu'aux prompts d'analyse de correction, pas à la transcription visuelle.
- `files/` contient les adaptateurs de lecture et de préparation des fichiers.

Les adaptateurs peuvent utiliser les APIs externes nécessaires mais ne doivent pas faire importer ces APIs dans le domaine ou l'application. La mémoire n'est pas un fine-tuning automatique : les retours sont locaux, limités à une correction et les règles ne sont réutilisées entre corrections que si l'enseignant les a explicitement promues au barème correspondant.

### Interface — `src/ui/`

Les composants React affichent l'état et traduisent les interactions en appels applicatifs. Ils ne doivent pas importer directement `src/adapters/`, construire des requêtes IndexedDB ou contenir des règles métier. Les dépendances concrètes sont fournies depuis `src/main.tsx`.

### Composition root — `src/main.tsx`

Seul point d'assemblage des adaptateurs concrets, services applicatifs et composants racine. Les imports transversaux y sont attendus : ce fichier connecte les ports à leurs adaptateurs.

## Flux principaux

1. L'enseignant configure un barème et sélectionne des images ou un PDF.
2. L'adaptateur fichiers prépare les pages localement en mémoire.
3. Le port IA est fourni par l'adaptateur Ollama configuré par l'utilisateur. La correction utilise une lecture visuelle puis une analyse selon le barème ; la transcription conservée localement peut être réutilisée pour relancer une analyse. Pour importer un barème depuis une photo, un unique appel au modèle de vision Ollama demande une sortie JSON structurée, validée côté application avant affichage. Les imports de documents texte restent déterministes et locaux.
4. La réponse est validée avant présentation. Une proposition n'est jamais automatiquement acceptée ; l'enseignant conserve la décision finale.
5. Les corrections et retours choisis sont enregistrés par le cas d'usage via le port de persistance vers IndexedDB. Le navigateur n'envoie pas cette mémoire à un service cloud.
6. Le contexte issu de la mémoire est consultatif et ne supplante jamais le barème courant.

## Tests et garde-fous d'architecture

Pyramide attendue :
1. **Unitaires** : domaine et cas d'usage avec ports simulés, sans React ni navigateur.
2. **Intégration** : adaptateurs avec APIs simulées (IndexedDB via `fake-indexeddb`, appels HTTP simulés).
3. **Interface / parcours** : tests de composants ou Playwright lorsque le parcours navigateur complet est disponible.

Les tests d'architecture vérifient les frontières d'import : le domaine n'importe aucune couche externe ; l'application ne dépend que du domaine et des ports ; l'UI n'importe pas les adaptateurs ; les adaptateurs ne dépendent pas de l'UI ou de l'application ; seul le composition root assemble les implémentations. Toute nouvelle dépendance inter-couche doit être justifiée et couverte par ces tests.

Commandes de validation :
- `npm test` — tests unitaires et d'intégration
- `npm run typecheck` — vérification TypeScript
- `npm run build` — typecheck et build de production
- `npm run test:coverage` — couverture globale

## Limites connues

- Ollama doit être accessible depuis le navigateur ; sa configuration CORS peut être nécessaire.
- Un modèle de vision est requis pour analyser des images.
- Le niveau de confiance retourné par un modèle n'est pas une mesure statistique calibrée.
- Les justifications générées doivent être vérifiées sur la copie originale.
- IndexedDB conserve les données sur le profil de navigateur de l'appareil ; elles peuvent être perdues si les données du site sont effacées. Les photos et transcriptions ne sont pas encore toutes persistées comme un dossier de correction complet.
