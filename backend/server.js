require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const port = Number(process.env.PORT) || 3001;
const model = process.env.OPENAI_MODEL || 'gpt-5.2';
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const shopifyConfig = {
  apiKey: process.env.SHOPIFY_API_KEY || '',
  apiSecret: process.env.SHOPIFY_API_SECRET || '',
  appUrl: process.env.SHOPIFY_APP_URL || '',
  scopes: process.env.SHOPIFY_SCOPES || 'read_content',
  apiVersion: process.env.SHOPIFY_API_VERSION || '2025-10',
  afterAuthRedirect:
    process.env.SHOPIFY_AFTER_AUTH_REDIRECT || 'http://localhost:3000/?shopify=connected',
};

const merchantKnowledgeTemplate = {
  sourceTemplates: [
    {
      type: 'store_policy',
      label: 'Store Policy',
      suggestedName: 'Store policies',
      content: `Shipping:
- Add shipping speed, pricing, and delivery expectations.

Returns and refunds:
- Add eligibility rules, timelines, exclusions, and refund timing.

Exchanges:
- Add exchange rules if your store offers them.

Order changes:
- Add cancellation or edit windows.

Support hours:
- Add business hours and channel availability.`,
    },
    {
      type: 'faq_file',
      label: 'FAQ File',
      suggestedName: 'Merchant FAQ upload',
      content: `Q: Where is my order?
A: Orders ship within 2 business days and tracking is emailed after dispatch.

Q: Can I return sale items?
A: Sale items are final sale unless they arrive damaged.`,
    },
  ],
};

function getDefaultMerchantSettings() {
  return {
    assistantName: 'StoreReply Support',
    welcomeMessage: 'Hi there. Ask a question about shipping, returns, exchanges, or your order.',
    placeholderText: 'Type your question...',
    accentColor: '#d8633d',
    tone: 'friendly',
    botEnabled: true,
  };
}

const pendingShopifyStates = new Map();
const dataDirectory = path.join(__dirname, 'data');
const appStatePath = path.join(dataDirectory, 'app-state.json');
const frontendDistDirectory = path.resolve(__dirname, '../frontend/dist');

function ensureDataDirectory() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function loadPersistedState() {
  ensureDataDirectory();

  if (!fs.existsSync(appStatePath)) {
    return {
      shopifySessions: {},
      merchantSettings: {},
      conversationHistory: {},
      usageStats: {},
    };
  }

  try {
    const raw = fs.readFileSync(appStatePath, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      shopifySessions:
        parsed && typeof parsed.shopifySessions === 'object' && parsed.shopifySessions
          ? parsed.shopifySessions
          : {},
      merchantSettings:
        parsed && typeof parsed.merchantSettings === 'object' && parsed.merchantSettings
          ? parsed.merchantSettings
          : {},
      conversationHistory:
        parsed && typeof parsed.conversationHistory === 'object' && parsed.conversationHistory
          ? parsed.conversationHistory
          : {},
      usageStats:
        parsed && typeof parsed.usageStats === 'object' && parsed.usageStats
          ? parsed.usageStats
          : {},
    };
  } catch (error) {
    console.error('Failed to load persisted app state:', error);
    return {
      shopifySessions: {},
      merchantSettings: {},
      conversationHistory: {},
      usageStats: {},
    };
  }
}

function savePersistedState(
  shopifySessionsMap,
  merchantSettingsMap,
  conversationHistoryMap,
  usageStatsMap
) {
  ensureDataDirectory();

  const payload = {
    shopifySessions: Object.fromEntries(shopifySessionsMap.entries()),
    merchantSettings: Object.fromEntries(merchantSettingsMap.entries()),
    conversationHistory: Object.fromEntries(conversationHistoryMap.entries()),
    usageStats: Object.fromEntries(usageStatsMap.entries()),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(appStatePath, JSON.stringify(payload, null, 2));
}

const persistedState = loadPersistedState();
const shopifySessions = new Map(Object.entries(persistedState.shopifySessions));
const merchantSettings = new Map(Object.entries(persistedState.merchantSettings));
const conversationHistory = new Map(Object.entries(persistedState.conversationHistory));
const usageStats = new Map(Object.entries(persistedState.usageStats));
const answerCache = new Map();

function getConversationHistoryKey(shop) {
  return isValidShopDomain(shop) ? shop : 'demo-store';
}

function getConversationHistory(shop) {
  const key = getConversationHistoryKey(shop);
  const saved = conversationHistory.get(key);

  return {
    key,
    conversations: Array.isArray(saved) ? saved : [],
  };
}

function recordConversation({
  shop,
  question,
  reply,
  knowledgeSourceCount,
  channel,
  usedSources,
  grounding,
}) {
  const key = getConversationHistoryKey(shop);
  const existing = getConversationHistory(key).conversations;
  const nextEntry = {
    id: crypto.randomUUID(),
    shop: key,
    question,
    reply,
    knowledgeSourceCount,
    channel: channel || 'unknown',
    usedSources: Array.isArray(usedSources) ? usedSources : [],
    grounding:
      grounding && typeof grounding === 'object'
        ? {
            label: grounding.label || 'Unknown',
            score: typeof grounding.score === 'number' ? grounding.score : 0,
          }
        : { label: 'Unknown', score: 0 },
    createdAt: new Date().toISOString(),
  };

  conversationHistory.set(key, [nextEntry, ...existing].slice(0, 100));
  savePersistedState(shopifySessions, merchantSettings, conversationHistory, usageStats);

  return nextEntry;
}

function getDefaultUsageStats() {
  return {
    totalQuestions: 0,
    storefrontQuestions: 0,
    merchantTestQuestions: 0,
    cachedRepliesServed: 0,
    lastAskedAt: null,
    daily: {},
  };
}

function getUsageStats(shop) {
  const key = getConversationHistoryKey(shop);
  const saved = usageStats.get(key);

  return {
    key,
    stats: {
      ...getDefaultUsageStats(),
      ...(saved && typeof saved === 'object' ? saved : {}),
    },
  };
}

function recordUsage({ shop, channel, cached }) {
  const result = getUsageStats(shop);
  const today = new Date().toISOString().slice(0, 10);
  const nextStats = {
    ...result.stats,
    totalQuestions: (result.stats.totalQuestions || 0) + 1,
    storefrontQuestions:
      (result.stats.storefrontQuestions || 0) + (channel === 'storefront_widget' ? 1 : 0),
    merchantTestQuestions:
      (result.stats.merchantTestQuestions || 0) + (channel === 'merchant_test' ? 1 : 0),
    cachedRepliesServed: (result.stats.cachedRepliesServed || 0) + (cached ? 1 : 0),
    lastAskedAt: new Date().toISOString(),
    daily: {
      ...(result.stats.daily && typeof result.stats.daily === 'object' ? result.stats.daily : {}),
      [today]:
        (
          result.stats.daily &&
          typeof result.stats.daily === 'object' &&
          typeof result.stats.daily[today] === 'number'
            ? result.stats.daily[today]
            : 0
        ) + 1,
    },
  };

  usageStats.set(result.key, nextStats);
  savePersistedState(shopifySessions, merchantSettings, conversationHistory, usageStats);

  return nextStats;
}

function getMerchantSettings(shop) {
  const key = isValidShopDomain(shop) ? shop : 'demo-store';
  const saved = merchantSettings.get(key);

  return {
    key,
    settings: {
      ...getDefaultMerchantSettings(),
      ...(saved && typeof saved === 'object' ? saved : {}),
    },
  };
}

function normalizeKnowledgeSources(body) {
  const directSources = Array.isArray(body.knowledgeSources) ? body.knowledgeSources : [];

  const normalizedDirectSources = directSources
    .filter((source) => source && typeof source === 'object')
    .map((source, index) => {
      const type = typeof source.type === 'string' ? source.type.trim() : '';
      const label = typeof source.label === 'string' ? source.label.trim() : '';
      const name = typeof source.name === 'string' ? source.name.trim() : '';
      const content = typeof source.content === 'string' ? source.content.trim() : '';

      return {
        id:
          typeof source.id === 'string' && source.id.trim()
            ? source.id.trim()
            : `${type || 'source'}-${index + 1}`,
        type: type || 'merchant_text',
        label: label || name || `Knowledge source ${index + 1}`,
        name: name || label || `Knowledge source ${index + 1}`,
        content,
      };
    })
    .filter((source) => source.content);

  if (normalizedDirectSources.length > 0) {
    return normalizedDirectSources;
  }

  const legacyPolicy = typeof body.policy === 'string' ? body.policy.trim() : '';
  const legacyFaqContent = typeof body.faqContent === 'string' ? body.faqContent.trim() : '';
  const legacyFaqFileName =
    typeof body.faqFileName === 'string' && body.faqFileName.trim()
      ? body.faqFileName.trim()
      : 'uploaded FAQ file';

  return [
    legacyPolicy
      ? {
          id: 'store-policy',
          type: 'store_policy',
          label: 'Store Policy',
          name: 'Store policies',
          content: legacyPolicy,
        }
      : null,
    legacyFaqContent
      ? {
          id: 'faq-upload',
          type: 'faq_file',
          label: 'FAQ File',
          name: legacyFaqFileName,
          content: legacyFaqContent,
        }
      : null,
  ].filter(Boolean);
}

function buildKnowledgePrompt(knowledgeSources) {
  return knowledgeSources
    .map(
      (source, index) => `Source ${index + 1}
Type: ${source.type}
Label: ${source.label}
Name: ${source.name}
Content:
${source.content}`
    )
    .join('\n\n');
}

function formatCustomerReply(replyText) {
  const text = typeof replyText === 'string' ? replyText : '';

  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipText(value, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function tokenizeForRetrieval(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function countTokenMatches(tokens, haystack) {
  let score = 0;

  tokens.forEach((token) => {
    if (haystack.includes(token)) {
      score += 1;
    }
  });

  return score;
}

function splitSourceIntoChunks(source, maxChunkLength = 900) {
  const content = typeof source.content === 'string' ? source.content.trim() : '';

  if (!content) {
    return [];
  }

  if (content.length <= maxChunkLength) {
    return [
      {
        ...source,
        content,
      },
    ];
  }

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let buffer = '';
  let chunkIndex = 1;

  const pushBuffer = () => {
    if (!buffer.trim()) {
      return;
    }

    chunks.push({
      ...source,
      id: `${source.id}-chunk-${chunkIndex}`,
      name: `${source.name} (Part ${chunkIndex})`,
      content: buffer.trim(),
    });
    chunkIndex += 1;
    buffer = '';
  };

  paragraphs.forEach((paragraph) => {
    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;

    if (next.length > maxChunkLength && buffer) {
      pushBuffer();
      buffer = paragraph;
      return;
    }

    if (paragraph.length > maxChunkLength) {
      pushBuffer();
      for (let index = 0; index < paragraph.length; index += maxChunkLength) {
        chunks.push({
          ...source,
          id: `${source.id}-chunk-${chunkIndex}`,
          name: `${source.name} (Part ${chunkIndex})`,
          content: paragraph.slice(index, index + maxChunkLength).trim(),
        });
        chunkIndex += 1;
      }
      return;
    }

    buffer = next;
  });

  pushBuffer();
  return chunks;
}

function selectRelevantKnowledgeSources(question, knowledgeSources, limit = 4) {
  const chunkedSources = knowledgeSources.flatMap((source) => splitSourceIntoChunks(source));
  const tokens = tokenizeForRetrieval(question);

  if (!tokens.length || chunkedSources.length <= limit) {
    return chunkedSources.slice(0, limit).map((source) => ({
      ...source,
      content: clipText(source.content, 1200),
      retrievalScore: 0,
    }));
  }

  const ranked = chunkedSources
    .map((source, index) => {
      const searchableText = `${source.type} ${source.label} ${source.name} ${source.content}`
        .toLowerCase()
        .slice(0, 6000);

      const tokenScore = countTokenMatches(tokens, searchableText);
      const exactNameBonus = tokens.some((token) => source.name.toLowerCase().includes(token)) ? 3 : 0;
      const exactLabelBonus = tokens.some((token) => source.label.toLowerCase().includes(token)) ? 2 : 0;

      return {
        source,
        index,
        score: tokenScore + exactNameBonus + exactLabelBonus,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    });

  const topMatches = ranked
    .filter((entry) => entry.score > 0)
    .slice(0, limit)
    .map((entry) => ({
      ...entry.source,
      retrievalScore: entry.score,
    }));

  if (topMatches.length > 0) {
    return topMatches;
  }

  return chunkedSources.slice(0, Math.min(2, limit)).map((source) => ({
    ...source,
    content: clipText(source.content, 1200),
    retrievalScore: 0,
  }));
}

function summarizeUsedSources(knowledgeSources) {
  return knowledgeSources.slice(0, 3).map((source) => ({
    id: source.id,
    name: source.name,
    label: source.label,
    type: source.type,
  }));
}

function buildGroundingSummary(knowledgeSources) {
  const topScore = knowledgeSources.reduce((best, source) => {
    const score = typeof source.retrievalScore === 'number' ? source.retrievalScore : 0;
    return score > best ? score : best;
  }, 0);

  if (!knowledgeSources.length) {
    return {
      label: 'Unknown',
      score: 0,
    };
  }

  if (topScore >= 5) {
    return {
      label: 'Strongly grounded',
      score: topScore,
    };
  }

  if (topScore >= 2) {
    return {
      label: 'Grounded',
      score: topScore,
    };
  }

  return {
    label: 'Weak match',
    score: topScore,
  };
}

function buildAnswerCacheKey({ shop, question, knowledgeSources }) {
  const sourceFingerprint = knowledgeSources
    .map((source) => `${source.id}:${source.content.length}`)
    .join('|');

  return `${getConversationHistoryKey(shop)}::${question.toLowerCase()}::${sourceFingerprint}`;
}

function getCachedAnswer(cacheKey) {
  const cached = answerCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > 5 * 60 * 1000) {
    answerCache.delete(cacheKey);
    return null;
  }

  return cached;
}

function setCachedAnswer(cacheKey, payload) {
  answerCache.set(cacheKey, {
    ...payload,
    createdAt: Date.now(),
  });
}

function isValidShopDomain(shop) {
  return typeof shop === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop.trim());
}

function validateRequiredShopifyConfig() {
  const missing = [];

  if (!shopifyConfig.apiKey) {
    missing.push('SHOPIFY_API_KEY');
  }

  if (!shopifyConfig.apiSecret) {
    missing.push('SHOPIFY_API_SECRET');
  }

  if (!shopifyConfig.appUrl) {
    missing.push('SHOPIFY_APP_URL');
  }

  return missing;
}

function buildCallbackUrl() {
  const appUrl = shopifyConfig.appUrl.replace(/\/$/, '');
  return `${appUrl}/auth/shopify/callback`;
}

function buildMerchantDashboardUrl(shop, connected) {
  const redirectUrl = new URL(shopifyConfig.afterAuthRedirect);

  if (isValidShopDomain(shop)) {
    redirectUrl.searchParams.set('shop', shop);
  }

  if (connected) {
    redirectUrl.searchParams.set('shopify', 'connected');
  }

  redirectUrl.hash = 'merchant';
  return redirectUrl.toString();
}

function buildHostedMerchantAppUrl(shop, connected) {
  const appUrl = new URL(shopifyConfig.appUrl.replace(/\/$/, ''));

  if (isValidShopDomain(shop)) {
    appUrl.searchParams.set('shop', shop);
  }

  if (connected) {
    appUrl.searchParams.set('shopify', 'connected');
  }

  return appUrl.toString();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMerchantAppPage(initialShop) {
  const shopValue = isValidShopDomain(initialShop) ? initialShop : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StoreReply Merchant App</title>
    <style>
      :root{--bg:#eef4fb;--card:#fffdf9;--ink:#17324d;--muted:#5d748d;--line:#d6e1ec;--accent:#d8633d;--ok:#e8f7ef;--okText:#176541;--warn:#fff4df;--warnText:#8a5a08;--err:#fff0ec;--errText:#932f16}
      *{box-sizing:border-box}body{margin:0;font-family:"Trebuchet MS","Segoe UI",sans-serif;background:linear-gradient(160deg,#f4eee4 0%,#dce8f4 100%);color:var(--ink)}
      button,input,textarea{font:inherit}button{cursor:pointer}button:disabled{opacity:.65;cursor:not-allowed}
      .shell{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:24px 0 40px}
      .hero,.card{background:rgba(255,253,249,.93);border:1px solid rgba(23,50,77,.1);border-radius:24px;box-shadow:0 24px 60px rgba(23,50,77,.1)}
      .hero{padding:30px;background:linear-gradient(135deg,#183557 0%,#23557a 60%,#2d7686 100%);color:#fff}
      .hero h1{margin:16px 0 10px;font-size:clamp(2rem,5vw,3.4rem);line-height:1}
      .hero p{margin:0;max-width:760px;line-height:1.6;color:rgba(255,253,248,.86)}
      .eyebrow,.badge{display:inline-flex;align-items:center;border-radius:999px}.eyebrow{padding:7px 12px;background:rgba(255,255,255,.12);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
      .grid{display:grid;gap:18px;margin-top:18px;grid-template-columns:1.1fr .9fr}
      .stack{display:grid;gap:18px}.card{padding:22px}
      .cardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}
      .card h2{margin:0;font-size:1.24rem}.copy{margin:6px 0 0;color:var(--muted);line-height:1.6}
      .label{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;font-weight:700;font-size:.95rem}.meta{color:var(--muted);font-weight:600}
      .input,.area{width:100%;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink)}.input{padding:14px 15px}.area{min-height:120px;padding:16px 17px;line-height:1.65}
      .row{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.primary,.secondary{border-radius:999px}.primary{border:none;background:var(--accent);color:#fff;padding:13px 18px;font-weight:800}.secondary{border:1px solid var(--line);background:#fff;padding:12px 16px;font-weight:700;color:var(--ink)}
      .badge{padding:8px 11px;font-size:.88rem;font-weight:700}.ready{background:var(--ok);color:var(--okText)}.loading{background:var(--warn);color:var(--warnText)}.error{background:var(--err);color:var(--errText)}
      .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.metric{padding:16px;border:1px solid var(--line);border-radius:18px;background:#fff}.metricLabel{color:var(--muted);font-size:.86rem}.metricValue{font-size:1.6rem;font-weight:800;margin-top:8px}.metricCopy{margin-top:8px;color:var(--muted);line-height:1.5;font-size:.92rem}
      .msg{margin-top:16px;padding:13px 15px;border-radius:16px;line-height:1.55}.msg.info{background:#edf6ff;color:#1e4e76}.msg.error{background:var(--err);color:var(--errText)}.note{color:var(--muted);font-size:.92rem;line-height:1.55}
      .hidden{display:none}
      @media (max-width:960px){.grid,.metrics{grid-template-columns:1fr}}
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="eyebrow">StoreReply Merchant App</div>
        <h1>Manage support settings inside the app page.</h1>
        <p>Use this page for merchant-owned settings like Shopify sync, assistant defaults, and usage review. Keep storefront appearance settings in the Shopify theme editor app embed.</p>
      </section>

      <div class="grid">
        <div class="stack">
          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Store connection</h2>
                <div class="copy">Connect Shopify, sync knowledge, and confirm the support agent is using live store content.</div>
              </div>
              <div id="connectionBadge" class="badge loading">Checking</div>
            </div>
            <label class="label" for="shopDomain">
              <span>Shopify store domain</span>
              <span id="syncMeta" class="meta">Not synced yet</span>
            </label>
            <input id="shopDomain" class="input" type="text" value="${escapeHtml(shopValue)}" placeholder="example-store.myshopify.com" />
            <div class="row">
              <button id="connectBtn" class="secondary" type="button">Connect Shopify</button>
              <button id="syncBtn" class="secondary" type="button">Sync Shopify data</button>
            </div>
            <div id="statusMessage" class="msg info hidden"></div>
          </section>

          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Customer-facing defaults</h2>
                <div class="copy">These settings stay in your app and become the default widget behavior unless Shopify embed overrides are intentionally filled in.</div>
              </div>
              <div id="settingsBadge" class="badge ready">App settings</div>
            </div>
            <label class="label" for="assistantName"><span>Assistant name</span><span class="meta">Default title</span></label>
            <input id="assistantName" class="input" type="text" />
            <label class="label" for="welcomeMessage" style="margin-top:16px"><span>Welcome message</span><span class="meta">Default greeting</span></label>
            <textarea id="welcomeMessage" class="area"></textarea>
            <label class="label" for="placeholderText" style="margin-top:16px"><span>Input placeholder</span><span class="meta">Default prompt</span></label>
            <input id="placeholderText" class="input" type="text" />
            <div class="row">
              <button id="saveSettingsBtn" class="primary" type="button">Save app settings</button>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Usage summary</h2>
                <div class="copy">Review how often the support agent is being used without leaving the app page.</div>
              </div>
              <div class="badge ready">Live metrics</div>
            </div>
            <div class="metrics">
              <div class="metric"><div class="metricLabel">Questions today</div><div id="metricToday" class="metricValue">0</div><div class="metricCopy">Questions across all channels today.</div></div>
              <div class="metric"><div class="metricLabel">Total questions</div><div id="metricTotal" class="metricValue">0</div><div class="metricCopy">All tracked support requests.</div></div>
              <div class="metric"><div class="metricLabel">Storefront widget</div><div id="metricStorefront" class="metricValue">0</div><div class="metricCopy">Customer questions from the storefront.</div></div>
              <div class="metric"><div class="metricLabel">Cache hits</div><div id="metricCache" class="metricValue">0</div><div class="metricCopy">Repeated questions answered faster from cache.</div></div>
            </div>
            <div id="usageMeta" class="note" style="margin-top:12px">No usage yet.</div>
          </section>

          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Storefront appearance</h2>
                <div class="copy">Widget layout, color, width, and optional Shopify-side text overrides stay in the theme editor so they do not overwrite your core app settings accidentally.</div>
              </div>
              <div class="badge ready">Theme editor</div>
            </div>
            <div class="note">Open Shopify theme editor → App embeds → StoreReply Chat to change storefront presentation safely.</div>
          </section>
        </div>
      </div>
    </div>

    <script>
      const shopDomainInput = document.getElementById('shopDomain');
      const connectBtn = document.getElementById('connectBtn');
      const syncBtn = document.getElementById('syncBtn');
      const saveSettingsBtn = document.getElementById('saveSettingsBtn');
      const statusMessage = document.getElementById('statusMessage');
      const connectionBadge = document.getElementById('connectionBadge');
      const syncMeta = document.getElementById('syncMeta');
      const settingsBadge = document.getElementById('settingsBadge');
      const params = new URLSearchParams(window.location.search);

      function setMessage(message, type) {
        statusMessage.className = 'msg ' + (type === 'error' ? 'error' : 'info');
        statusMessage.textContent = message;
        statusMessage.classList.remove('hidden');
      }

      async function loadStatus() {
        const shop = shopDomainInput.value.trim();
        if (!shop) return;

        const [statusResponse, settingsResponse, usageResponse] = await Promise.all([
          fetch('/api/shopify/status?shop=' + encodeURIComponent(shop)),
          fetch('/api/merchant-settings?shop=' + encodeURIComponent(shop)),
          fetch('/api/usage-stats?shop=' + encodeURIComponent(shop)),
        ]);

        const statusData = await statusResponse.json();
        const settingsData = await settingsResponse.json();
        const usageData = await usageResponse.json();

        connectionBadge.textContent = statusData.connected ? 'Connected' : 'Not connected';
        connectionBadge.className = 'badge ' + (statusData.connected ? 'ready' : 'loading');
        syncMeta.textContent = statusData.syncedAt ? 'Last sync: ' + statusData.syncedAt : 'Not synced yet';

        const settings = settingsData.settings || {};
        document.getElementById('assistantName').value = settings.assistantName || '';
        document.getElementById('welcomeMessage').value = settings.welcomeMessage || '';
        document.getElementById('placeholderText').value = settings.placeholderText || '';

        const stats = usageData.stats || {};
        document.getElementById('metricToday').textContent = usageData.todayCount || 0;
        document.getElementById('metricTotal').textContent = stats.totalQuestions || 0;
        document.getElementById('metricStorefront').textContent = stats.storefrontQuestions || 0;
        document.getElementById('metricCache').textContent = stats.cachedRepliesServed || 0;
        document.getElementById('usageMeta').textContent = stats.lastAskedAt
          ? 'Last activity: ' + new Date(stats.lastAskedAt).toLocaleString()
          : 'No usage yet.';
      }

      connectBtn.addEventListener('click', async () => {
        const shop = shopDomainInput.value.trim();
        if (!shop) {
          setMessage('Enter a Shopify store domain first.', 'error');
          return;
        }

        const response = await fetch('/api/shopify/start?shop=' + encodeURIComponent(shop));
        const data = await response.json();
        if (!response.ok) {
          setMessage(data.error || 'Could not start Shopify install.', 'error');
          return;
        }
        window.location.assign(data.authUrl);
      });

      syncBtn.addEventListener('click', async () => {
        const shop = shopDomainInput.value.trim();
        if (!shop) {
          setMessage('Enter a Shopify store domain first.', 'error');
          return;
        }

        const response = await fetch('/api/shopify/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop }),
        });
        const data = await response.json();
        if (!response.ok) {
          setMessage(data.error || 'Shopify sync failed.', 'error');
          return;
        }
        setMessage('Shopify sync complete.', 'info');
        loadStatus();
      });

      saveSettingsBtn.addEventListener('click', async () => {
        const shop = shopDomainInput.value.trim();
        settingsBadge.textContent = 'Saving...';
        settingsBadge.className = 'badge loading';

        const response = await fetch('/api/merchant-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop,
            settings: {
              assistantName: document.getElementById('assistantName').value,
              welcomeMessage: document.getElementById('welcomeMessage').value,
              placeholderText: document.getElementById('placeholderText').value,
            },
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          settingsBadge.textContent = 'App settings';
          settingsBadge.className = 'badge error';
          setMessage(data.error || 'Could not save merchant settings.', 'error');
          return;
        }
        settingsBadge.textContent = 'App settings';
        settingsBadge.className = 'badge ready';
        setMessage('App settings saved.', 'info');
      });

      if (params.get('shopify') === 'connected') {
        setMessage('Shopify connected. You can sync knowledge now.', 'info');
      }

      loadStatus();
    </script>
  </body>
</html>`;
}

function renderMerchantAppWorkspace(initialShop) {
  const shopValue = isValidShopDomain(initialShop) ? initialShop : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StoreReply Merchant App</title>
    <style>
      :root{--card:#fffdf9;--ink:#17324d;--muted:#5d748d;--line:#d6e1ec;--accent:#d8633d;--ok:#e8f7ef;--okText:#176541;--warn:#fff4df;--warnText:#8a5a08;--err:#fff0ec;--errText:#932f16}
      *{box-sizing:border-box}body{margin:0;font-family:"Trebuchet MS","Segoe UI",sans-serif;background:linear-gradient(160deg,#f4eee4 0%,#dce8f4 100%);color:var(--ink)}
      button,input,textarea,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.65;cursor:not-allowed}
      .shell{width:min(1220px,calc(100% - 32px));margin:0 auto;padding:24px 0 40px}
      .hero,.card{background:rgba(255,253,249,.93);border:1px solid rgba(23,50,77,.1);border-radius:24px;box-shadow:0 24px 60px rgba(23,50,77,.1)}
      .hero{padding:34px;background:linear-gradient(135deg,#183557 0%,#23557a 60%,#2d7686 100%);color:#fff;position:relative;overflow:hidden}
      .hero:after{content:"";position:absolute;right:-30px;bottom:-50px;width:200px;height:200px;border-radius:999px;background:rgba(255,255,255,.08)}
      .eyebrow,.badge,.pill,.state{display:inline-flex;align-items:center;border-radius:999px}
      .eyebrow{padding:7px 12px;background:rgba(255,255,255,.12);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
      .hero h1{margin:18px 0 12px;font-size:clamp(2.2rem,5vw,3.8rem);line-height:.95;max-width:760px}
      .hero p{margin:0;max-width:760px;line-height:1.65;color:rgba(255,253,248,.88)}
      .heroMeta{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
      .pill{padding:10px 13px;background:rgba(255,255,255,.12);font-size:.93rem}
      .overview,.layout,.miniGrid,.split,.metrics{display:grid;gap:16px}
      .overview{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:18px}
      .layout{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);margin-top:18px}
      .stack{display:grid;gap:18px}.card{padding:22px}
      .cardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}
      .card h2{margin:0;font-size:1.24rem}.copy{margin:6px 0 0;color:var(--muted);line-height:1.6}
      .badge{padding:8px 11px;font-size:.88rem;font-weight:700;white-space:nowrap}.ready{background:var(--ok);color:var(--okText)}.loading{background:var(--warn);color:var(--warnText)}.error{background:var(--err);color:var(--errText)}
      .metric{padding:18px}.metricLabel{color:var(--muted);font-size:.86rem}.metricValue{font-size:1.7rem;font-weight:800;margin-top:8px}.metricCopy{margin-top:8px;color:var(--muted);line-height:1.5;font-size:.92rem}
      .miniGrid,.metrics,.split{grid-template-columns:repeat(2,minmax(0,1fr))}
      .miniCard,.historyCard{padding:14px;border:1px solid var(--line);border-radius:18px;background:#fff}
      .miniLabel{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
      .miniValue{font-size:1rem;font-weight:800;margin-top:6px;line-height:1.45}
      .label{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;font-weight:700;font-size:.95rem}.meta{color:var(--muted);font-weight:600}
      .input,.area,.select{width:100%;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink)}
      .input,.select{padding:14px 15px}.area{min-height:120px;padding:16px 17px;line-height:1.65}
      .row{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.primary,.secondary{border-radius:999px}.primary{border:none;background:var(--accent);color:#fff;padding:13px 18px;font-weight:800}.secondary{border:1px solid var(--line);background:#fff;padding:12px 16px;font-weight:700;color:var(--ink)}
      .msg{margin-top:16px;padding:13px 15px;border-radius:16px;line-height:1.55}.msg.info{background:#edf6ff;color:#1e4e76}.msg.error{background:var(--err);color:var(--errText)}
      .note,.helper{color:var(--muted);font-size:.92rem;line-height:1.55}.helper{margin-top:10px}
      .checklist{display:grid;gap:10px;margin-top:16px}
      .checkItem{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:16px;background:#fff}
      .checkTitle{font-weight:800}.checkCopy{font-size:.92rem;color:var(--muted);margin-top:4px;line-height:1.5}
      .state{padding:6px 10px;font-size:.8rem;font-weight:800}.state.ok{background:var(--ok);color:var(--okText)}.state.warn{background:var(--warn);color:var(--warnText)}
      .toggleRow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:#fff;margin-top:16px}
      .toggleLabel{font-weight:800}.toggleCopy{font-size:.9rem;color:var(--muted);margin-top:4px;line-height:1.5}
      .switch{display:inline-flex;align-items:center;gap:10px;font-weight:700}
      .swatchRow{display:flex;align-items:center;gap:12px}.colorInput{width:56px;height:44px;padding:4px;border-radius:12px;border:1px solid var(--line);background:#fff}
      details.history{margin-top:16px;border:1px solid var(--line);border-radius:18px;background:#fff;overflow:hidden}
      details.history summary{list-style:none;cursor:pointer;padding:16px 18px;font-weight:800;display:flex;justify-content:space-between;align-items:center}
      details.history summary::-webkit-details-marker{display:none}
      .historyBody{padding:0 18px 18px}.historyList{display:grid;gap:12px}
      .logMeta{display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:.86rem}.logTag{padding:6px 10px;border-radius:999px;background:#f4f8fb;border:1px solid #dce7f0}
      .logQuestion,.logReply{margin-top:10px;padding:12px;border-radius:14px;line-height:1.6;white-space:pre-wrap}.logQuestion{background:#fff3ed;color:#884026}.logReply{background:#edf6ff;color:#17324d}
      .hidden{display:none}
      @media (max-width:1080px){.overview{grid-template-columns:repeat(2,minmax(0,1fr))}.layout,.metrics,.split,.miniGrid{grid-template-columns:1fr}}
      @media (max-width:720px){.overview{grid-template-columns:1fr}.cardHead,.label,.checkItem,.toggleRow{flex-direction:column;align-items:flex-start}.shell{width:min(100% - 24px,1220px)}}
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="eyebrow">StoreReply Merchant App</div>
        <h1>Run the support agent inside Shopify without mixing up which settings live where.</h1>
        <p>Use this page for support behavior, knowledge, merchant defaults, usage, and customer history. Use the Shopify theme editor only for widget appearance and placement.</p>
        <div class="heroMeta">
          <div class="pill">Merchant-owned settings</div>
          <div class="pill">Shopify sync</div>
          <div class="pill">History and usage</div>
        </div>
      </section>

      <section class="overview">
        <div class="metric hero card">
          <div class="metricLabel">Connection status</div>
          <div id="metricConnection" class="metricValue">Pending</div>
          <div id="metricConnectionCopy" class="metricCopy">Connect a Shopify store to start syncing merchant knowledge.</div>
        </div>
        <div class="metric card">
          <div class="metricLabel">Shopify sources</div>
          <div id="metricSources" class="metricValue">0</div>
          <div class="metricCopy">Imported pages and policies available to the support agent.</div>
        </div>
        <div class="metric card">
          <div class="metricLabel">Questions today</div>
          <div id="metricToday" class="metricValue">0</div>
          <div class="metricCopy">Customer and merchant support questions tracked today.</div>
        </div>
        <div class="metric card">
          <div class="metricLabel">Storefront widget</div>
          <div id="metricStorefront" class="metricValue">0</div>
          <div class="metricCopy">Questions coming from the live storefront widget.</div>
        </div>
      </section>

      <div class="layout">
        <div class="stack">
          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Merchant operations center</h2>
                <div class="copy">This keeps the merchant flow obvious: connect, sync, save defaults, then monitor usage and history without hunting around.</div>
              </div>
              <div class="badge ready">Control center</div>
            </div>
            <div class="miniGrid">
              <div class="miniCard">
                <div class="miniLabel">Next best action</div>
                <div id="nextAction" class="miniValue">Enter a Shopify store domain to activate merchant-specific settings and tracking.</div>
              </div>
              <div class="miniCard">
                <div class="miniLabel">Where settings live</div>
                <div class="miniValue">App page for behavior and knowledge. Shopify theme editor for widget appearance and placement.</div>
              </div>
            </div>
            <div class="checklist">
              <div class="checkItem">
                <div>
                  <div class="checkTitle">Store connected</div>
                  <div id="opConnectionCopy" class="checkCopy">Connect a Shopify store before syncing or testing anything live.</div>
                </div>
                <div id="opConnectionState" class="state warn">Needs action</div>
              </div>
              <div class="checkItem">
                <div>
                  <div class="checkTitle">Knowledge synced</div>
                  <div id="opSyncCopy" class="checkCopy">Run a Shopify sync so the assistant has grounded store content.</div>
                </div>
                <div id="opSyncState" class="state warn">Needs action</div>
              </div>
              <div class="checkItem">
                <div>
                  <div class="checkTitle">Merchant defaults saved</div>
                  <div id="opSettingsCopy" class="checkCopy">Save the assistant name and welcome message merchants want customers to see.</div>
                </div>
                <div id="opSettingsState" class="state warn">Needs action</div>
              </div>
              <div class="checkItem">
                <div>
                  <div class="checkTitle">Bot live state</div>
                  <div id="opBotCopy" class="checkCopy">The support agent is paused until the merchant enables it.</div>
                </div>
                <div id="opBotState" class="state warn">Needs action</div>
              </div>
            </div>
            <div id="statusMessage" class="msg info hidden"></div>
          </section>

          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Store connection</h2>
                <div class="copy">Connect Shopify, sync knowledge, and confirm the support agent is using live store content.</div>
              </div>
              <div id="connectionBadge" class="badge loading">Checking</div>
            </div>
            <label class="label" for="shopDomain">
              <span>Shopify store domain</span>
              <span id="syncMeta" class="meta">Not synced yet</span>
            </label>
            <input id="shopDomain" class="input" type="text" value="${escapeHtml(shopValue)}" placeholder="example-store.myshopify.com" />
            <div class="row">
              <button id="connectBtn" class="secondary" type="button">Connect Shopify</button>
              <button id="syncBtn" class="secondary" type="button">Sync Shopify data</button>
              <button id="refreshBtn" class="secondary" type="button">Refresh status</button>
            </div>
            <div class="helper">Use this area only for store connection and knowledge import. Storefront appearance stays in the Shopify theme editor.</div>
          </section>

          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Support settings</h2>
                <div class="copy">These settings stay in your app and remain the source of truth for assistant behavior and customer-facing copy.</div>
              </div>
              <div id="settingsBadge" class="badge ready">App settings</div>
            </div>
            <label class="label" for="assistantName"><span>Assistant name</span><span class="meta">Default title</span></label>
            <input id="assistantName" class="input" type="text" />
            <label class="label" for="welcomeMessage" style="margin-top:16px"><span>Welcome message</span><span class="meta">Default greeting</span></label>
            <textarea id="welcomeMessage" class="area"></textarea>
            <label class="label" for="placeholderText" style="margin-top:16px"><span>Input placeholder</span><span class="meta">Default prompt</span></label>
            <input id="placeholderText" class="input" type="text" />
            <div class="split" style="margin-top:16px">
              <div>
                <label class="label" for="tone"><span>Reply tone</span><span class="meta">Support personality</span></label>
                <select id="tone" class="select">
                  <option value="friendly">Friendly</option>
                  <option value="concise">Concise</option>
                  <option value="reassuring">Reassuring</option>
                </select>
              </div>
              <div>
                <label class="label" for="accentColor"><span>Brand accent</span><span class="meta">Widget default</span></label>
                <div class="swatchRow">
                  <input id="accentColor" class="colorInput" type="color" />
                  <input id="accentColorText" class="input" type="text" />
                </div>
              </div>
            </div>
            <div class="toggleRow">
              <div>
                <div class="toggleLabel">Bot live state</div>
                <div class="toggleCopy">Pause storefront replies without losing knowledge, history, or saved settings.</div>
              </div>
              <label class="switch">
                <input id="botEnabled" type="checkbox" />
                <span id="botEnabledLabel">Enabled</span>
              </label>
            </div>
            <div class="row">
              <button id="saveSettingsBtn" class="primary" type="button">Save app settings</button>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Usage summary</h2>
                <div class="copy">Review how often the support agent is being used without leaving the app page.</div>
              </div>
              <div class="badge ready">Live metrics</div>
            </div>
            <div class="metrics">
              <div class="metric"><div class="metricLabel">Total questions</div><div id="metricTotal" class="metricValue">0</div><div class="metricCopy">All tracked support requests.</div></div>
              <div class="metric"><div class="metricLabel">Merchant test</div><div id="metricMerchantTests" class="metricValue">0</div><div class="metricCopy">Questions asked from merchant testing.</div></div>
              <div class="metric"><div class="metricLabel">Cache hits</div><div id="metricCache" class="metricValue">0</div><div class="metricCopy">Repeated questions answered faster from cache.</div></div>
              <div class="metric"><div class="metricLabel">Last activity</div><div id="metricLastActivity" class="metricValue">No activity</div><div class="metricCopy">Most recent tracked support activity for this store.</div></div>
            </div>
            <div id="usageMeta" class="note" style="margin-top:12px">No usage yet.</div>
            <details class="history" id="historyPanel">
              <summary>
                <span>Customer history</span>
                <span id="historySummaryMeta" class="meta">No conversations yet</span>
              </summary>
              <div class="historyBody">
                <div class="note" style="margin-bottom:12px">History stays tucked away here so it is available when needed without taking over the whole merchant screen.</div>
                <div id="historyList" class="historyList">
                  <div class="note">No tracked conversations yet.</div>
                </div>
              </div>
            </details>
          </section>

          <section class="card">
            <div class="cardHead">
              <div>
                <h2>Storefront appearance</h2>
                <div class="copy">This area is intentionally separate so merchants never confuse support behavior with storefront layout.</div>
              </div>
              <div class="badge ready">Theme editor</div>
            </div>
            <div class="miniGrid">
              <div class="miniCard">
                <div class="miniLabel">Change here in the app</div>
                <div class="miniValue">Knowledge sync, assistant name, greeting, placeholder, tone, bot live state, usage, and customer history.</div>
              </div>
              <div class="miniCard">
                <div class="miniLabel">Change in Shopify theme editor</div>
                <div class="miniValue">Launcher label, widget subtitle, position, accent color, panel width, corner style, and mobile visibility.</div>
              </div>
            </div>
            <div class="row">
              <button id="themeHintBtn" class="secondary" type="button">How to edit storefront appearance</button>
            </div>
            <div id="themeHint" class="note hidden" style="margin-top:12px">Open Shopify theme editor, then App embeds, then StoreReply Chat. Use that area only for widget appearance and placement.</div>
          </section>
        </div>
      </div>
    </div>

    <script>
      const shopDomainInput = document.getElementById('shopDomain');
      const connectBtn = document.getElementById('connectBtn');
      const syncBtn = document.getElementById('syncBtn');
      const refreshBtn = document.getElementById('refreshBtn');
      const saveSettingsBtn = document.getElementById('saveSettingsBtn');
      const themeHintBtn = document.getElementById('themeHintBtn');
      const themeHint = document.getElementById('themeHint');
      const statusMessage = document.getElementById('statusMessage');
      const connectionBadge = document.getElementById('connectionBadge');
      const syncMeta = document.getElementById('syncMeta');
      const settingsBadge = document.getElementById('settingsBadge');
      const params = new URLSearchParams(window.location.search);
      const historyList = document.getElementById('historyList');
      const historySummaryMeta = document.getElementById('historySummaryMeta');

      function setMessage(message, type) {
        statusMessage.className = 'msg ' + (type === 'error' ? 'error' : 'info');
        statusMessage.textContent = message;
        statusMessage.classList.remove('hidden');
      }

      function escapeBrowserHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function setStateBadge(id, complete) {
        const element = document.getElementById(id);
        element.textContent = complete ? 'Ready' : 'Needs action';
        element.className = 'state ' + (complete ? 'ok' : 'warn');
      }

      function renderHistory(conversations) {
        if (!Array.isArray(conversations) || !conversations.length) {
          historySummaryMeta.textContent = 'No conversations yet';
          historyList.innerHTML = '<div class="note">No tracked conversations yet.</div>';
          return;
        }

        historySummaryMeta.textContent = conversations.length + ' recent conversation' + (conversations.length === 1 ? '' : 's');
        historyList.innerHTML = conversations.map((entry) => {
          const channel = entry.channel === 'storefront_widget' ? 'Storefront widget' : 'Merchant test';
          const createdAt = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Unknown time';
          const sourceCount = typeof entry.knowledgeSourceCount === 'number' ? entry.knowledgeSourceCount : 0;
          const groundingLabel = entry.grounding && entry.grounding.label ? entry.grounding.label : 'Unknown grounding';
          const usedSources = Array.isArray(entry.usedSources) && entry.usedSources.length
            ? entry.usedSources.map((source) => {
                const label = source && source.label ? source.label : 'Source';
                const name = source && source.name ? source.name : 'Unknown';
                return '<div class="logTag">' + escapeBrowserHtml(label + ': ' + name) + '</div>';
              }).join('')
            : '<div class="logTag">No source detail saved</div>';

          return '<div class="historyCard">' +
            '<div class="logMeta">' +
              '<div class="logTag">' + escapeBrowserHtml(channel) + '</div>' +
              '<div class="logTag">' + escapeBrowserHtml(createdAt) + '</div>' +
              '<div class="logTag">' + escapeBrowserHtml(String(sourceCount)) + ' sources</div>' +
            '</div>' +
            '<div class="logQuestion">' + escapeBrowserHtml(entry.question || 'No question stored.') + '</div>' +
            '<div class="logReply">' + escapeBrowserHtml(entry.reply || 'No reply stored.') + '</div>' +
            '<div class="logMeta" style="margin-top:10px">' +
              '<div class="logTag">' + escapeBrowserHtml(groundingLabel) + '</div>' +
              usedSources +
            '</div>' +
          '</div>';
        }).join('');
      }

      function updateDashboard(data) {
        const shopifyStatus = data.shopifyStatus || {};
        const settings = data.settings || {};
        const usage = data.usage || {};
        const stats = usage.stats || {};
        const conversations = Array.isArray(data.conversations) ? data.conversations : [];

        connectionBadge.textContent = shopifyStatus.connected ? 'Connected' : 'Not connected';
        connectionBadge.className = 'badge ' + (shopifyStatus.connected ? 'ready' : 'loading');
        syncMeta.textContent = shopifyStatus.syncedAt ? 'Last sync: ' + shopifyStatus.syncedAt : 'Not synced yet';

        document.getElementById('metricConnection').textContent = shopifyStatus.connected ? 'Live' : 'Pending';
        document.getElementById('metricConnectionCopy').textContent = shopifyStatus.connected
          ? 'Connected to ' + (shopDomainInput.value.trim() || 'your Shopify store') + '.'
          : 'Connect a Shopify store to start syncing merchant knowledge.';
        document.getElementById('metricSources').textContent = shopifyStatus.knowledgeSourceCount || 0;
        document.getElementById('metricToday').textContent = usage.todayCount || 0;
        document.getElementById('metricStorefront').textContent = stats.storefrontQuestions || 0;
        document.getElementById('metricTotal').textContent = stats.totalQuestions || 0;
        document.getElementById('metricMerchantTests').textContent = stats.merchantTestQuestions || 0;
        document.getElementById('metricCache').textContent = stats.cachedRepliesServed || 0;
        document.getElementById('metricLastActivity').textContent = stats.lastAskedAt ? new Date(stats.lastAskedAt).toLocaleString() : 'No activity';
        document.getElementById('usageMeta').textContent = stats.lastAskedAt ? 'Last activity: ' + new Date(stats.lastAskedAt).toLocaleString() : 'No usage yet.';

        document.getElementById('assistantName').value = settings.assistantName || '';
        document.getElementById('welcomeMessage').value = settings.welcomeMessage || '';
        document.getElementById('placeholderText').value = settings.placeholderText || '';
        document.getElementById('tone').value = settings.tone || 'friendly';
        document.getElementById('accentColor').value = settings.accentColor || '#d8633d';
        document.getElementById('accentColorText').value = settings.accentColor || '#d8633d';
        document.getElementById('botEnabled').checked = settings.botEnabled !== false;
        document.getElementById('botEnabledLabel').textContent = settings.botEnabled === false ? 'Paused' : 'Enabled';

        const hasDefaults = Boolean((settings.assistantName || '').trim() && (settings.welcomeMessage || '').trim());
        const botEnabled = settings.botEnabled !== false;

        document.getElementById('opConnectionCopy').textContent = shopifyStatus.connected
          ? 'Connected to ' + (shopDomainInput.value.trim() || 'your Shopify store') + '.'
          : 'Connect a Shopify store before syncing or testing anything live.';
        document.getElementById('opSyncCopy').textContent = shopifyStatus.knowledgeSourceCount
          ? shopifyStatus.knowledgeSourceCount + ' Shopify source' + (shopifyStatus.knowledgeSourceCount === 1 ? '' : 's') + ' imported.'
          : 'Run a Shopify sync so the assistant has grounded store content.';
        document.getElementById('opSettingsCopy').textContent = hasDefaults
          ? 'Assistant voice and greeting are configured.'
          : 'Save the assistant name and welcome message merchants want customers to see.';
        document.getElementById('opBotCopy').textContent = botEnabled
          ? 'The support agent is enabled and ready for storefront questions.'
          : 'The support agent is paused. Merchants can keep settings saved while the storefront stays quiet.';

        setStateBadge('opConnectionState', Boolean(shopifyStatus.connected));
        setStateBadge('opSyncState', Boolean(shopifyStatus.knowledgeSourceCount));
        setStateBadge('opSettingsState', hasDefaults);
        setStateBadge('opBotState', botEnabled);

        const nextAction = !shopDomainInput.value.trim()
          ? 'Enter a Shopify store domain to activate merchant-specific settings and tracking.'
          : !shopifyStatus.connected
            ? 'Connect Shopify so the app can sync real store knowledge.'
            : !shopifyStatus.knowledgeSourceCount
              ? 'Run a Shopify sync to import policies and pages.'
              : !botEnabled
                ? 'Re-enable the support agent when you are ready to expose it on the storefront.'
                : 'Review live history and keep refining support behavior from this app page.';
        document.getElementById('nextAction').textContent = nextAction;

        renderHistory(conversations);
      }

      async function loadStatus(options = {}) {
        const shop = shopDomainInput.value.trim();
        if (!shop) return;

        const response = await fetch('/api/dashboard-bootstrap?shop=' + encodeURIComponent(shop));
        const data = await response.json();
        if (!response.ok) {
          if (!options.silent) {
            setMessage(data.error || 'Could not load merchant dashboard data.', 'error');
          }
          return;
        }
        updateDashboard(data);
      }

      connectBtn.addEventListener('click', async () => {
        const shop = shopDomainInput.value.trim();
        if (!shop) {
          setMessage('Enter a Shopify store domain first.', 'error');
          return;
        }

        const response = await fetch('/api/shopify/start?shop=' + encodeURIComponent(shop));
        const data = await response.json();
        if (!response.ok) {
          setMessage(data.error || 'Could not start Shopify install.', 'error');
          return;
        }
        window.location.assign(data.authUrl);
      });

      syncBtn.addEventListener('click', async () => {
        const shop = shopDomainInput.value.trim();
        if (!shop) {
          setMessage('Enter a Shopify store domain first.', 'error');
          return;
        }

        const response = await fetch('/api/shopify/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop }),
        });
        const data = await response.json();
        if (!response.ok) {
          setMessage(data.error || 'Shopify sync failed.', 'error');
          return;
        }
        setMessage('Shopify sync complete.', 'info');
        loadStatus({ silent: true });
      });

      saveSettingsBtn.addEventListener('click', async () => {
        const shop = shopDomainInput.value.trim();
        settingsBadge.textContent = 'Saving...';
        settingsBadge.className = 'badge loading';

        const response = await fetch('/api/merchant-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop,
            settings: {
              assistantName: document.getElementById('assistantName').value,
              welcomeMessage: document.getElementById('welcomeMessage').value,
              placeholderText: document.getElementById('placeholderText').value,
              tone: document.getElementById('tone').value,
              accentColor: document.getElementById('accentColorText').value,
              botEnabled: document.getElementById('botEnabled').checked,
            },
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          settingsBadge.textContent = 'App settings';
          settingsBadge.className = 'badge error';
          setMessage(data.error || 'Could not save merchant settings.', 'error');
          return;
        }
        settingsBadge.textContent = 'App settings';
        settingsBadge.className = 'badge ready';
        setMessage('App settings saved.', 'info');
        loadStatus({ silent: true });
      });

      refreshBtn.addEventListener('click', async () => {
        await loadStatus();
        setMessage('Merchant app status refreshed.', 'info');
      });

      themeHintBtn.addEventListener('click', () => {
        themeHint.classList.toggle('hidden');
      });

      document.getElementById('accentColor').addEventListener('input', (event) => {
        document.getElementById('accentColorText').value = event.target.value;
      });

      document.getElementById('accentColorText').addEventListener('input', (event) => {
        const value = event.target.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(value)) {
          document.getElementById('accentColor').value = value;
        }
      });

      document.getElementById('botEnabled').addEventListener('change', (event) => {
        document.getElementById('botEnabledLabel').textContent = event.target.checked ? 'Enabled' : 'Paused';
      });

      if (params.get('shopify') === 'connected') {
        setMessage('Shopify connected. You can sync knowledge now.', 'info');
      }

      loadStatus();
      setInterval(() => {
        loadStatus({ silent: true });
      }, 10000);
    </script>
  </body>
</html>`;
}

function buildInstallUrl(shop, state) {
  const params = new URLSearchParams({
    client_id: shopifyConfig.apiKey,
    scope: shopifyConfig.scopes,
    redirect_uri: buildCallbackUrl(),
    state,
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

function createHmac(params, secret) {
  const sortedEntries = Array.from(params.entries())
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join('&');

  return crypto.createHmac('sha256', secret).update(sortedEntries).digest('hex');
}

function verifyShopifyHmac(query) {
  const providedHmac = typeof query.hmac === 'string' ? query.hmac : '';

  if (!providedHmac || !shopifyConfig.apiSecret) {
    return false;
  }

  const queryParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => queryParams.append(key, entry));
      return;
    }

    if (typeof value === 'string') {
      queryParams.append(key, value);
    }
  });

  const expectedHmac = createHmac(queryParams, shopifyConfig.apiSecret);
  const provided = Buffer.from(providedHmac, 'utf8');
  const expected = Buffer.from(expectedHmac, 'utf8');

  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

async function exchangeCodeForAccessToken(shop, code) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: shopifyConfig.apiKey,
      client_secret: shopifyConfig.apiSecret,
      code,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange Shopify auth code.');
  }

  return data.access_token;
}

async function runShopifyGraphQL(shop, accessToken, query) {
  const response = await fetch(
    `https://${shop}/admin/api/${shopifyConfig.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.errors?.[0]?.message || 'Shopify GraphQL request failed.');
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    throw new Error(data.errors[0].message || 'Shopify GraphQL returned an error.');
  }

  return data.data;
}

function buildShopifyKnowledgeSources(data) {
  const shopName = data?.shop?.name || 'Shopify store';
  const policies = Array.isArray(data?.shop?.shopPolicies) ? data.shop.shopPolicies : [];
  const pages = Array.isArray(data?.pages?.nodes) ? data.pages.nodes : [];

  const policySources = policies
    .filter((policy) => policy && policy.body)
    .map((policy) => ({
      id: policy.id,
      type: 'shopify_policy_page',
      label: 'Shopify Policy',
      name: policy.title || policy.type || 'Policy',
      content: policy.body,
      sourceShop: shopName,
      url: policy.url || '',
    }));

  const pageSources = pages
    .filter((pageItem) => pageItem && pageItem.body)
    .map((pageItem) => ({
      id: pageItem.id,
      type: 'shopify_page',
      label: 'Shopify Page',
      name: pageItem.title || pageItem.handle || 'Page',
      content: pageItem.body,
      sourceShop: shopName,
      handle: pageItem.handle || '',
    }));

  return [...policySources, ...pageSources];
}

async function syncShopifyKnowledge(shop) {
  const session = shopifySessions.get(shop);

  if (!session?.accessToken) {
    throw new Error('This shop is not connected yet.');
  }

  const fullQuery = `
    query SyncSupportKnowledge {
      shop {
        name
        shopPolicies {
          id
          title
          body
          type
          url
        }
      }
      pages(first: 25) {
        nodes {
          id
          title
          handle
          body
        }
      }
    }
  `;

  const policyOnlyQuery = `
    query SyncSupportKnowledgePoliciesOnly {
      shop {
        name
        shopPolicies {
          id
          title
          body
          type
          url
        }
      }
    }
  `;

  let data;
  let syncWarning = '';

  try {
    data = await runShopifyGraphQL(shop, session.accessToken, fullQuery);
  } catch (error) {
    const message = error.message || '';

    if (message.toLowerCase().includes('pages')) {
      data = await runShopifyGraphQL(shop, session.accessToken, policyOnlyQuery);
      syncWarning =
        'Shopify denied access to online store pages, so only store policies were imported.';
    } else {
      throw error;
    }
  }

  const knowledgeSources = buildShopifyKnowledgeSources(data);

  const updatedSession = {
    ...session,
    shop,
    syncedAt: new Date().toISOString(),
    knowledgeSources,
    syncWarning,
  };

  shopifySessions.set(shop, updatedSession);
  savePersistedState(shopifySessions, merchantSettings, conversationHistory, usageStats);

  return updatedSession;
}

function getShopifyStatus(shop) {
  if (!isValidShopDomain(shop)) {
    return {
      connected: false,
      shop: '',
      knowledgeSourceCount: 0,
      syncedAt: null,
    };
  }

  const session = shopifySessions.get(shop);

  return {
    connected: Boolean(session?.accessToken),
    shop,
    knowledgeSourceCount: session?.knowledgeSources?.length || 0,
    syncedAt: session?.syncedAt || null,
  };
}

function buildWidgetConfig(shop) {
  const { settings } = getMerchantSettings(shop);
  const session = isValidShopDomain(shop) ? shopifySessions.get(shop) : null;

  return {
    shop: isValidShopDomain(shop) ? shop : '',
    settings,
    connected: Boolean(session?.accessToken),
    knowledgeSourceCount: Array.isArray(session?.knowledgeSources)
      ? session.knowledgeSources.length
      : 0,
    syncedAt: session?.syncedAt || null,
  };
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

if (fs.existsSync(frontendDistDirectory)) {
  app.use('/workspace', express.static(frontendDistDirectory));

  app.get(['/workspace', /^\/workspace\/.*/], (req, res) => {
    res.sendFile(path.join(frontendDistDirectory, 'index.html'));
  });
}

app.get('/', (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  return res.send(renderMerchantAppWorkspace(shop));
});

app.get('/health', (req, res) => {
  res.send('Server is working');
});

app.get('/api/message', (req, res) => {
  res.json({ message: 'Hello from backend!' });
});

app.get('/api/merchant-knowledge-template', (req, res) => {
  res.json(merchantKnowledgeTemplate);
});

app.get('/api/shopify/config', (req, res) => {
  const missing = validateRequiredShopifyConfig();

  res.json({
    ready: missing.length === 0,
    missing,
    scopes: shopifyConfig.scopes,
    callbackUrl: buildCallbackUrl(),
    afterAuthRedirect: shopifyConfig.afterAuthRedirect,
    apiVersion: shopifyConfig.apiVersion,
  });
});

app.get('/api/shopify/status', (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  res.json(getShopifyStatus(shop));
});

app.get('/api/merchant-settings', (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  const result = getMerchantSettings(shop);

  res.json({
    shop: result.key,
    settings: result.settings,
  });
});

app.get('/api/widget-config', (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';

  if (!isValidShopDomain(shop)) {
    return res.status(400).json({
      error: 'Enter a valid shop domain like example-store.myshopify.com.',
    });
  }

  return res.json(buildWidgetConfig(shop));
});

app.get('/api/dashboard-bootstrap', (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  const usageResult = getUsageStats(shop);
  const conversationResult = getConversationHistory(shop);
  const settingsResult = getMerchantSettings(shop);
  const today = new Date().toISOString().slice(0, 10);

  res.json({
    shop: settingsResult.key,
    shopifyStatus: getShopifyStatus(shop),
    settings: settingsResult.settings,
    conversations: conversationResult.conversations,
    usage: {
      stats: usageResult.stats,
      todayCount:
        usageResult.stats.daily && typeof usageResult.stats.daily[today] === 'number'
          ? usageResult.stats.daily[today]
          : 0,
    },
  });
});

app.get('/api/conversations', (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  const result = getConversationHistory(shop);

  res.json({
    shop: result.key,
    conversations: result.conversations,
  });
});

app.get('/api/usage-stats', (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  const result = getUsageStats(shop);
  const today = new Date().toISOString().slice(0, 10);

  res.json({
    shop: result.key,
    stats: result.stats,
    todayCount:
      result.stats.daily && typeof result.stats.daily[today] === 'number'
        ? result.stats.daily[today]
        : 0,
  });
});

app.post('/api/merchant-settings', (req, res) => {
  const shop = typeof req.body.shop === 'string' ? req.body.shop.trim() : '';
  const incomingSettings =
    req.body.settings && typeof req.body.settings === 'object' ? req.body.settings : {};
  const result = getMerchantSettings(shop);

  const nextSettings = {
    ...result.settings,
    assistantName:
      typeof incomingSettings.assistantName === 'string'
        ? incomingSettings.assistantName.trim() || result.settings.assistantName
        : result.settings.assistantName,
    welcomeMessage:
      typeof incomingSettings.welcomeMessage === 'string'
        ? incomingSettings.welcomeMessage.trim() || result.settings.welcomeMessage
        : result.settings.welcomeMessage,
    placeholderText:
      typeof incomingSettings.placeholderText === 'string'
        ? incomingSettings.placeholderText.trim() || result.settings.placeholderText
        : result.settings.placeholderText,
    accentColor:
      typeof incomingSettings.accentColor === 'string'
        ? incomingSettings.accentColor.trim() || result.settings.accentColor
        : result.settings.accentColor,
    tone:
      typeof incomingSettings.tone === 'string'
        ? incomingSettings.tone.trim() || result.settings.tone
        : result.settings.tone,
    botEnabled:
      typeof incomingSettings.botEnabled === 'boolean'
        ? incomingSettings.botEnabled
        : result.settings.botEnabled,
  };

  merchantSettings.set(result.key, nextSettings);
  savePersistedState(shopifySessions, merchantSettings, conversationHistory, usageStats);

  res.json({
    shop: result.key,
    settings: nextSettings,
  });
});

app.get('/api/shopify/start', (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  const missing = validateRequiredShopifyConfig();

  if (missing.length > 0) {
    return res.status(500).json({
      error: `Missing Shopify env vars: ${missing.join(', ')}`,
    });
  }

  if (!isValidShopDomain(shop)) {
    return res.status(400).json({
      error: 'Enter a valid shop domain like example-store.myshopify.com.',
    });
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingShopifyStates.set(state, {
    shop,
    createdAt: Date.now(),
  });

  return res.json({
    authUrl: buildInstallUrl(shop, state),
  });
});

app.get('/auth/shopify/callback', async (req, res) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
  const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';

  if (!isValidShopDomain(shop)) {
    return res.status(400).send('Invalid Shopify shop domain.');
  }

  if (!code || !state) {
    return res.status(400).send('Missing Shopify callback parameters.');
  }

  if (!verifyShopifyHmac(req.query)) {
    return res.status(400).send('Invalid Shopify callback signature.');
  }

  const pending = pendingShopifyStates.get(state);

  if (!pending || pending.shop !== shop) {
    return res.status(400).send('Invalid or expired Shopify install state.');
  }

  pendingShopifyStates.delete(state);

  try {
    const accessToken = await exchangeCodeForAccessToken(shop, code);
    shopifySessions.set(shop, {
      shop,
      accessToken,
      installedAt: new Date().toISOString(),
      syncedAt: null,
      knowledgeSources: [],
    });
    savePersistedState(shopifySessions, merchantSettings, conversationHistory, usageStats);

    return res.redirect(buildHostedMerchantAppUrl(shop, true));
  } catch (error) {
    console.error('Shopify auth failed:', error);
    return res.status(500).send(error.message || 'Shopify auth failed.');
  }
});

app.post('/api/shopify/sync', async (req, res) => {
  const shop = typeof req.body.shop === 'string' ? req.body.shop.trim() : '';

  if (!isValidShopDomain(shop)) {
    return res.status(400).json({
      error: 'Enter a valid shop domain before syncing Shopify.',
    });
  }

  try {
    const session = await syncShopifyKnowledge(shop);

    return res.json({
      shop,
      syncedAt: session.syncedAt,
      knowledgeSources: session.knowledgeSources,
      knowledgeSourceCount: session.knowledgeSources.length,
      warning: session.syncWarning || '',
    });
  } catch (error) {
    console.error('Shopify sync failed:', error);
    return res.status(500).json({
      error: error.message || 'Shopify sync failed.',
    });
  }
});

app.post('/ask', async (req, res) => {
  const userQuestion = typeof req.body.question === 'string' ? req.body.question.trim() : '';
  const manualKnowledgeSources = normalizeKnowledgeSources(req.body);
  const requestedShop = typeof req.body.shop === 'string' ? req.body.shop.trim() : '';
  const requestChannel = typeof req.body.channel === 'string' ? req.body.channel.trim() : '';
  const shopifyKnowledgeSources =
    isValidShopDomain(requestedShop) && shopifySessions.get(requestedShop)?.knowledgeSources
      ? shopifySessions.get(requestedShop).knowledgeSources
      : [];
  const knowledgeSources = [...manualKnowledgeSources, ...shopifyKnowledgeSources];
  const selectedKnowledgeSources = selectRelevantKnowledgeSources(userQuestion, knowledgeSources);
  const usedSources = summarizeUsedSources(selectedKnowledgeSources);
  const grounding = buildGroundingSummary(selectedKnowledgeSources);
  const cacheKey = buildAnswerCacheKey({
    shop: requestedShop,
    question: userQuestion,
    knowledgeSources: selectedKnowledgeSources,
  });

  console.log('User asked:', userQuestion);

  if (!client) {
    return res.status(500).json({
      error: 'Missing OPENAI_API_KEY in backend/.env',
    });
  }

  if (!userQuestion) {
    return res.status(400).json({
      error: 'Please send a question string in the request body.',
    });
  }

  if (knowledgeSources.length === 0) {
    return res.status(400).json({
      error: 'Add at least one merchant knowledge source before asking a question.',
    });
  }

  const cachedAnswer = getCachedAnswer(cacheKey);

  if (cachedAnswer) {
    recordUsage({
      shop: requestedShop,
      channel:
        requestChannel || (isValidShopDomain(requestedShop) ? 'storefront_widget' : 'merchant_test'),
      cached: true,
    });
    recordConversation({
      shop: requestedShop,
      question: userQuestion,
      reply: cachedAnswer.reply,
      knowledgeSourceCount: selectedKnowledgeSources.length,
      channel:
        requestChannel || (isValidShopDomain(requestedShop) ? 'storefront_widget' : 'merchant_test'),
      usedSources: cachedAnswer.usedSources || usedSources,
      grounding: cachedAnswer.grounding || grounding,
    });

    return res.json({
      reply: cachedAnswer.reply,
      knowledgeSourceCount: selectedKnowledgeSources.length,
      totalKnowledgeSourceCount: knowledgeSources.length,
      cached: true,
      usedSources: cachedAnswer.usedSources || usedSources,
      grounding: cachedAnswer.grounding || grounding,
    });
  }

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You are a customer support agent for an ecommerce merchant. Answer using the merchant knowledge sources only. Write like a real support rep in live chat: plain English, warm, direct, and brief. Default to 1 or 2 short sentences and keep the reply under about 60 words unless the customer clearly asks for more detail. Do not use bullet points, markdown, bold text, headings, or policy-analysis language. Do not explain your reasoning. If the sources do not clearly answer the question, say the store information provided does not specify it and invite the customer to contact support.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Merchant knowledge sources:

${buildKnowledgePrompt(selectedKnowledgeSources)}

Customer question:
${userQuestion}`,
            },
          ],
        },
      ],
    });
    const formattedReply = formatCustomerReply(response.output_text);

    recordConversation({
      shop: requestedShop,
      question: userQuestion,
      reply: formattedReply,
      knowledgeSourceCount: selectedKnowledgeSources.length,
      channel: requestChannel || (isValidShopDomain(requestedShop) ? 'storefront_widget' : 'merchant_test'),
      usedSources,
      grounding,
    });
    recordUsage({
      shop: requestedShop,
      channel:
        requestChannel || (isValidShopDomain(requestedShop) ? 'storefront_widget' : 'merchant_test'),
      cached: false,
    });
    setCachedAnswer(cacheKey, {
      reply: formattedReply,
      usedSources,
      grounding,
    });

    return res.json({
      reply: formattedReply,
      knowledgeSourceCount: selectedKnowledgeSources.length,
      totalKnowledgeSourceCount: knowledgeSources.length,
      cached: false,
      usedSources,
      grounding,
    });
  } catch (error) {
    console.error('OpenAI request failed:', error);

    const statusCode = error.status || 500;
    const errorMessage =
      error.error?.message || error.message || 'Failed to generate a response from OpenAI.';

    return res.status(statusCode).json({
      error: errorMessage,
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
