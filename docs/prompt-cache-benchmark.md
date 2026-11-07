# Étude : cache de préfixe pendant les corrections locales

## Constat (Mac Intel, Qwen 3.5 4B Q4_K_M)

Sur les mêmes poids, trois essais par moteur donnent environ 8,5–8,7 tokens/s en génération. L'écart de temps de la transcription fictive répétée provient surtout de l'évaluation des prompts : Ollama descend de 21,74 s à 15,28 s, tandis que llama.cpp reste autour de 21–22 s (une mesure à 33,48 s). **Le comparatif initial n'était pas équitable :** il utilisait `cache_prompt=false` côté llama.cpp et la politique de cache native côté Ollama. Le gain ne peut donc pas être attribué au moteur.

## Audit du parcours de correction

- Le mode **génératif incrémental** utilise `buildIncrementalCriterionPrompt` ; `compactCriterionContext` place consigne, sujet et transcription *avant* les informations du critère. Les critères successifs d'une **même copie** peuvent donc partager un préfixe. Cela ne prouve pas que le cache serveur soit effectivement réutilisé.
- Dans la variante B, la transcription est limitée à la question concernée ; les préfixes peuvent changer d'une question à l'autre. Il ne faut jamais mélanger des transcriptions de copies/étudiants différents pour maximiser artificiellement le cache.
- Le mode **décisionnel natif** utilise `/v1/systemone`, avec plusieurs attendus regroupés dans une requête. Une optimisation de `/api/chat` n'implique aucun gain automatique sur System One.
- Ollama fournit éventuellement `prompt_eval_cached_count`. La vitesse `prompt_eval_count / prompt_eval_duration` peut être trompeuse si une partie des tokens est issue du cache. Comparer le temps mural, le coût de prétraitement, la note et les preuves.

## Exécution du benchmark

Arrêter l'autre serveur llama.cpp sur le port 8081, laisser Ollama démarré, puis lancer depuis la racine de ce dépôt :

```bash
python3 scripts/benchmark_prompt_cache.py
```

Le script utilise le même fichier GGUF que l'installation Ollama (par défaut `qwen3.5:4b`) et le binaire CPU `~/ai-lab/llama.cpp/build-cpu-sdk/bin/llama-server`, créés lors du protocole local. Aucun service distant ni dépendance Python externe n'est requis.

Il exécute deux scénarios fictifs : (1) prompts identiques, (2) transcription commune et critère variable en suffixe. Pour llama.cpp, l'option `cache_prompt` est explicitement testée en `false` et `true`, avec un nouveau serveur pour chaque scénario et chaque configuration, afin d'éviter qu'un premier scénario préchauffe artificiellement le suivant. Ollama utilise sa politique native, sans interrupteur cache équivalent, et est déchargé entre scénarios.

Le rapport `~/ai-lab/benchmark-cache-ollama-llamacpp-qwen35.json` contient uniquement les compteurs, métadonnées et empreintes SHA-256 des réponses : ni copie, ni prompt intégral, ni clé API. Les journaux de serveur restent sur le poste.

## Interprétation et critères de validation

Observer : durée complète, `prompt_eval_duration`, tokens évalués, tokens cachés si disponibles, empreintes des sorties, échecs. Le cache peut modifier légèrement les résultats numériques selon le backend ; les empreintes de réponses ne prouvent pas la justesse scientifique et doivent être complétées par le protocole pédagogique de répétabilité.

**Ne pas modifier les notes, le barème, le routage System One ou le pipeline enseignant avant d'avoir un gain de temps reproductible et des notes/preuves stables.** Mesurer idéalement trois copies fictives et des séries de critères différents ; un benchmark d'un prompt répété à l'identique seul surestime les gains réels.

Vérification locale du script, sans serveur IA :

```bash
python3 -m unittest discover -s scripts -p 'test_benchmark_prompt_cache.py'
```
