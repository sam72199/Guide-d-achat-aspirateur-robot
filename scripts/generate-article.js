/**
 * generate-article.js
 * ---------------------------------------------------------
 * Génère automatiquement l'article du jour pour le blog
 * "Aspiro Comparatif", insère les liens affiliés Amazon,
 * crée la page HTML, et met à jour la liste des articles
 * ainsi que la grille de la page d'accueil.
 *
 * Exécuté chaque jour par GitHub Actions (voir
 * .github/workflows/daily-article.yml).
 *
 * Variables d'environnement attendues :
 *   ANTHROPIC_API_KEY  -> votre clé API Anthropic (secret GitHub)
 *   AMAZON_TAG         -> (optionnel) écrase le tag défini dans
 *                         config/affiliate-config.json
 * ---------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ARTICLES_DIR = path.join(ROOT, "articles");
const DATA_FILE = path.join(ROOT, "data", "articles.json");
const INDEX_FILE = path.join(ROOT, "index.html");
const CONFIG_FILE = path.join(ROOT, "config", "affiliate-config.json");
const TOPICS_FILE = path.join(__dirname, "topics.json");

const MODEL = "claude-sonnet-5";

// ---------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------
// 1. Choisir le sujet du jour
// ---------------------------------------------------------

function pickTopic(topics, existingArticles) {
  const dayOfWeek = new Date().getDay(); // 0 = dimanche
  const type = topics.schedule[String(dayOfWeek)] || "article";
  const pool = topics[type];

  const usedTitles = new Set(existingArticles.map(a => a.title));
  const available = pool.filter(t => !usedTitles.has(t));

  // Si tous les sujets du pool ont déjà été traités, on repart du début
  // (permet de laisser tourner le système indéfiniment sans intervention).
  const chosen = (available.length > 0 ? available : pool)[
    Math.floor(Math.random() * (available.length > 0 ? available.length : pool.length))
  ];

  return { type, title: chosen };
}

// ---------------------------------------------------------
// 2. Appeler l'API Claude pour générer l'article
// ---------------------------------------------------------

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquante dans les variables d'environnement.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur API Anthropic (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find(b => b.type === "text");
  if (!textBlock) throw new Error("Réponse API sans contenu texte.");
  return textBlock.text;
}

function buildPrompt(topic, products) {
  const productList = products
    .map(p => `- ${p.name} (gamme de prix indicative : ${p.priceRange})`)
    .join("\n");

  return `Tu es rédacteur SEO senior pour un blog d'affiliation français spécialisé dans les aspirateurs robots. Rédige un article de blog complet en français, d'environ 2500 mots, sur le sujet suivant :

TITRE : "${topic.title}"
TYPE D'ARTICLE : ${topic.type} (comparatif = tableau + sélection de produits ; guide = pédagogique étape par étape ; article = thématique, entretien/astuces/actualité)

CONTRAINTES DE FORMAT (réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après, sans balises markdown \`\`\`) :

{
  "metaTitle": "titre SEO de 50-60 caractères incluant le mot-clé principal",
  "metaDescription": "meta description de 140-155 caractères, incitant au clic",
  "h1": "titre principal de la page (peut différer légèrement du metaTitle)",
  "readingTime": "estimation du type '11 min'",
  "bodyHtml": "le corps de l'article en HTML pur (h2, h3, p, ul, li, table/thead/tbody/tr/th/td, strong), SANS balise <html>/<head>/<body>, prêt à être injecté tel quel dans un template. Doit faire environ 2500 mots. Doit inclure : une introduction, plusieurs sections avec H2, un tableau si pertinent pour le type d'article, et une section finale intitulée 'Foire aux questions' avec 3 à 4 questions/réponses, chacune encapsulée dans <div class=\\"faq-item\\"><h3>Question</h3><p>Réponse</p></div>.",
  "productMentions": ["1 à 3 noms de produits/catégories mentionnés dans le texte, à choisir strictement dans cette liste : ${products.map(p => p.name).join(" | ")}"]
}

Liste des produits/catégories que tu peux mentionner et recommander naturellement dans le texte (ne cite AUCUNE marque ni modèle réel précis, reste générique par gamme/catégorie) :
${productList}

Règles éditoriales :
- Ton informatif, factuel, orienté conseil pratique, pas de superlatifs excessifs.
- Ne jamais inventer de chiffres de test ou d'affirmations vérifiables non génériques présentées comme des faits mesurés par la rédaction ; reste sur des ordres de grandeur plausibles et connus du secteur (Pa, autonomie en minutes, dB).
- N'utilise aucune marque déposée ni nom de modèle réel.
- Structure claire avec H2/H3, phrases courtes, paragraphes de 2-4 phrases.
- Réponds uniquement avec le JSON demandé.`;
}

// ---------------------------------------------------------
// 3. Insérer les liens affiliés dans le corps HTML généré
// ---------------------------------------------------------

function buildAffiliateUrl(config, productName) {
  const tag = process.env.AMAZON_TAG || config.amazonTag;
  const domain = config.amazonDomain || "amazon.fr";
  const product = config.products.find(p => p.name === productName);

  if (product && product.asin) {
    return `https://www.${domain}/dp/${product.asin}?tag=${tag}`;
  }
  // Pas d'ASIN renseigné -> lien de recherche Amazon sur le nom du produit
  const query = encodeURIComponent(productName);
  return `https://www.${domain}/s?k=${query}&tag=${tag}`;
}

function insertAffiliateLinks(bodyHtml, productMentions, config) {
  let html = bodyHtml;

  productMentions.forEach(productName => {
    const url = buildAffiliateUrl(config, productName);
    // On ne lie que la PREMIÈRE occurrence textuelle du nom de produit
    // pour éviter de sur-optimiser (mauvais pour le SEO et l'UX).
    const escaped = productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "i");
    let replaced = false;
    html = html.replace(regex, (match) => {
      if (replaced) return match;
      replaced = true;
      return `<a href="${url}" class="aff-link" rel="sponsored nofollow" target="_blank">${match}</a>`;
    });
  });

  return html;
}

// ---------------------------------------------------------
// 4. Construire la page HTML de l'article
// ---------------------------------------------------------

function buildArticlePage({ h1, metaTitle, metaDescription, bodyHtml, typeLabel, dateLabel, readingTime, mainProductName, mainProductUrl }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${metaTitle} | Aspiro Comparatif</title>
<meta name="description" content="${metaDescription}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a href="../index.html" class="logo">Aspiro<span class="dot">.</span>Comparatif</a>
    <nav class="main-nav">
      <a href="../index.html#comparatifs">Comparatifs</a>
      <a href="../index.html#guides">Guides d'achat</a>
      <a href="../index.html#articles">Articles</a>
      <a href="../mentions-legales.html">À propos</a>
    </nav>
  </div>
</header>

<div class="article-head">
  <div class="wrap">
    <span class="type-badge">${typeLabel}</span>
    <h1>${h1}</h1>
    <div class="article-meta">Publié le ${dateLabel} · ${readingTime} de lecture</div>
  </div>
</div>

<div class="article-body">
  <div class="wrap article-layout">

    <article class="prose">
${bodyHtml}
    </article>

    <aside class="sidebar">
      <div class="pick-card">
        <span class="kicker">Notre sélection</span>
        <h4>${mainProductName}</h4>
        <a href="${mainProductUrl}" class="btn btn-cta" rel="sponsored nofollow" target="_blank">Voir le prix sur Amazon</a>
      </div>
      <div class="disclosure">
        En tant que Partenaire Amazon, ce site est susceptible de percevoir une commission sur les achats éligibles, sans coût supplémentaire pour vous. <a href="../mentions-legales.html">En savoir plus</a>.
      </div>
    </aside>

  </div>
</div>

<footer class="site-footer">
  <div class="wrap">
    <span>© ${new Date().getFullYear()} Aspiro Comparatif</span>
    <div class="footer-links">
      <a href="../mentions-legales.html">Mentions légales &amp; affiliation</a>
      <a href="../mentions-legales.html#contact">Contact</a>
    </div>
  </div>
</footer>

</body>
</html>
`;
}

// ---------------------------------------------------------
// 5. Mettre à jour la grille de la page d'accueil
// ---------------------------------------------------------

const TYPE_LABELS = { comparatif: "Comparatif", guide: "Guide complet", article: "Article" };
const TYPE_CLASS = { comparatif: "type-comparatif", guide: "type-guide", article: "type-article" };

function buildCardHtml(article) {
  return `      <a href="articles/${article.slug}.html" class="card">
        <div class="card-thumb ${TYPE_CLASS[article.type]}"><span class="type-badge">${TYPE_LABELS[article.type]}</span></div>
        <div class="card-body">
          <h3>${article.title}</h3>
          <p>${article.description}</p>
          <div class="card-meta"><span>${article.date}</span><span>~${article.readingTime}</span></div>
        </div>
      </a>`;
}

function updateHomepage(allArticles) {
  const indexHtml = fs.readFileSync(INDEX_FILE, "utf8");

  // On affiche les articles les plus récents en premier, limité à 12 sur l'accueil.
  const sorted = [...allArticles].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
  const cardsHtml = sorted.map(buildCardHtml).join("\n");

  const updated = indexHtml.replace(
    /<!-- ARTICLES_START -->[\s\S]*<!-- ARTICLES_END -->/,
    `<!-- ARTICLES_START -->\n${cardsHtml}\n<!-- ARTICLES_END -->`
  );

  fs.writeFileSync(INDEX_FILE, updated, "utf8");
}

// ---------------------------------------------------------
// Programme principal
// ---------------------------------------------------------

async function main() {
  const config = loadJSON(CONFIG_FILE);
  const topics = loadJSON(TOPICS_FILE);
  const existingArticles = loadJSON(DATA_FILE);

  const topic = pickTopic(topics, existingArticles);
  console.log(`Sujet retenu (${topic.type}) : ${topic.title}`);

  const prompt = buildPrompt(topic, config.products);
  const raw = await callClaude(prompt);

  let generated;
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    generated = JSON.parse(cleaned);
  } catch (e) {
    console.error("Réponse brute reçue :", raw);
    throw new Error("Impossible de parser le JSON renvoyé par le modèle : " + e.message);
  }

  const bodyWithLinks = insertAffiliateLinks(generated.bodyHtml, generated.productMentions || [], config);

  const slug = slugify(topic.title);
  const dateISO = todayISO();
  const dateLabel = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const mainProductName = (generated.productMentions && generated.productMentions[0]) || config.products[0].name;
  const mainProductUrl = buildAffiliateUrl(config, mainProductName);

  const pageHtml = buildArticlePage({
    h1: generated.h1,
    metaTitle: generated.metaTitle,
    metaDescription: generated.metaDescription,
    bodyHtml: bodyWithLinks,
    typeLabel: TYPE_LABELS[topic.type],
    dateLabel,
    readingTime: generated.readingTime || "10 min",
    mainProductName,
    mainProductUrl,
  });

  if (!fs.existsSync(ARTICLES_DIR)) fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTICLES_DIR, `${slug}.html`), pageHtml, "utf8");

  existingArticles.push({
    slug,
    title: topic.title,
    description: generated.metaDescription,
    type: topic.type,
    date: dateISO,
    readingTime: generated.readingTime || "10 min",
  });
  saveJSON(DATA_FILE, existingArticles);

  updateHomepage(existingArticles);

  console.log(`Article publié : articles/${slug}.html`);
}

main().catch(err => {
  console.error("Échec de la génération :", err);
  process.exit(1);
});
