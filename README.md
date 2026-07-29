# Aspiro Comparatif — Blog d'affiliation automatisé (aspirateurs robots)

Ce projet contient :
- un site vitrine (HTML/CSS statique) avec 2 articles d'exemple déjà publiés,
- un script qui génère automatiquement un nouvel article de ~2500 mots chaque jour via l'API Claude,
- un système d'insertion automatique de liens affiliés Amazon,
- un workflow GitHub Actions qui exécute tout ça chaque jour sans intervention.

## 1. Mise en ligne du site (5 minutes)

Le plus simple : **GitHub Pages**.

1. Créez un compte sur [github.com](https://github.com) si vous n'en avez pas.
2. Créez un nouveau dépôt (repository), par exemple `aspiro-comparatif`, en **public**.
3. Uploadez tout le contenu de ce dossier dans le dépôt (via l'interface web "Add file → Upload files", ou avec `git` si vous êtes à l'aise).
4. Dans le dépôt, allez dans **Settings → Pages**, et choisissez la branche `main` comme source. Votre site sera en ligne quelques minutes après, à une adresse du type `https://votre-pseudo.github.io/aspiro-comparatif/`.

À ce stade, vous avez un site en ligne avec 2 articles réels — c'est ce dont vous avez besoin pour l'étape suivante.

## 2. Créer votre compte Amazon Partenaires

1. Allez sur [affiliate-program.amazon.fr](https://affiliate-program.amazon.fr) et créez un compte.
2. Renseignez l'URL de votre site (celle de l'étape 1).
3. Amazon vous demandera de décrire votre site et son contenu — mentionnez qu'il s'agit d'un blog de comparatifs et guides d'achat sur les aspirateurs robots.
4. Une fois validé, Amazon vous attribue un **tag d'affiliation** (ex : `aspirocomparatif-21`).

⚠️ Important : avant validation définitive, Amazon exige généralement que vous réalisiez au moins 3 ventes qualifiées dans les 180 jours, sous peine de fermeture du compte. Gardez ça en tête en démarrant la promotion du site (réseaux sociaux, SEO, etc.).

## 3. Renseigner votre tag d'affiliation

Ouvrez `config/affiliate-config.json` et remplacez :
```json
"amazonTag": "VOTRE-TAG-21"
```
par votre vrai tag, par exemple :
```json
"amazonTag": "aspirocomparatif-21"
```

Vous pouvez aussi renseigner les **ASIN** (identifiants produits Amazon) dans la liste `products` si vous voulez pointer vers des fiches produit précises plutôt que vers des résultats de recherche Amazon — plus précis, mais demande un peu plus de maintenance manuelle pour vérifier que les produits restent en stock.

Alternative plus sûre : au lieu de modifier ce fichier, vous pouvez définir un secret GitHub `AMAZON_TAG` (voir étape 4) — il sera automatiquement utilisé à la place de la valeur du fichier, sans jamais apparaître en clair dans le code.

## 4. Obtenir une clé API Anthropic

1. Créez un compte sur [console.anthropic.com](https://console.anthropic.com).
2. Générez une clé API dans la section **API Keys**.
3. Ajoutez du crédit sur le compte (la génération d'un article de 2500 mots par jour représente un coût modeste, de l'ordre de quelques centimes à environ un euro par article selon le modèle utilisé).

## 5. Configurer les secrets GitHub

Dans votre dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**, ajoutez :

| Nom du secret | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | votre clé API Anthropic |
| `AMAZON_TAG` | votre tag d'affiliation Amazon (optionnel si déjà mis dans le fichier de config) |

## 6. C'est tout — le système tourne seul

Le fichier `.github/workflows/daily-article.yml` est déjà configuré pour se déclencher **chaque jour à 6h UTC**. Chaque exécution :
1. choisit le sujet du jour (comparatif / guide / article, selon le calendrier de `scripts/topics.json`),
2. génère un article de ~2500 mots via l'API Claude,
3. insère automatiquement les liens affiliés Amazon,
4. crée la page HTML dans `articles/`,
5. met à jour la page d'accueil,
6. commit et publie automatiquement (GitHub Pages se met à jour dans la foulée).

Vous pouvez aussi déclencher une génération manuellement à tout moment : dans GitHub, onglet **Actions → Publication quotidienne d'un article → Run workflow**.

## 7. Personnaliser le calendrier de sujets

`scripts/topics.json` contient trois listes de sujets (`comparatif`, `guide`, `article`) et un calendrier `schedule` qui indique quel type de contenu publier selon le jour de la semaine. Vous pouvez :
- ajouter de nouveaux sujets dans chaque liste à tout moment (le pool ne se videra jamais vraiment tant que vous en ajoutez),
- changer la répartition des types par jour dans `schedule`.

## 8. Compléter les mentions légales

Le fichier `mentions-legales.html` contient des champs `[À compléter]` (éditeur du site, hébergeur, contact, RGPD). Amazon Partenaires et la loi française exigent ces informations sur un site qui monétise du contenu — à remplir avant de soumettre votre candidature d'affiliation.

## Coûts récurrents

- **Hébergement (GitHub Pages)** : gratuit.
- **GitHub Actions** : gratuit pour un dépôt public, dans la limite large des minutes incluses.
- **API Anthropic** : facturée à l'usage, de l'ordre de quelques dizaines de centimes par article selon le modèle configuré dans `scripts/generate-article.js` (variable `MODEL`).

## Limites à connaître

- Le script génère du contenu *générique* (pas de marques/modèles réels précis) pour rester factuellement prudent tant que vous n'avez pas vérifié chaque affirmation. Vous pouvez enrichir les prompts dans `scripts/generate-article.js` (fonction `buildPrompt`) pour citer des modèles réels une fois que vous validez chaque article manuellement, ou brancher une recherche web dans le script pour des données produits à jour.
- Pensez à relire les premiers articles générés avant de les laisser en ligne durablement, le temps de calibrer le prompt à votre goût éditorial.
