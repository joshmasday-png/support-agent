import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const quickQuestions = [
  'A customer says their package arrived damaged. What should we tell them?',
  'Can someone return a final sale item?',
  'Can an order still be canceled 90 minutes after it was placed?',
];

const supportedFileTypes = '.txt,.md,.csv,.json';

const styles = `
  :root{--bg:#eef4fb;--card:#fffdf9;--ink:#17324d;--muted:#5d748d;--line:#d6e1ec;--accent:#d8633d;--accent2:#2f7a7c;--ok:#e8f7ef;--okText:#176541;--warn:#fff4df;--warnText:#8a5a08;--err:#fff0ec;--errText:#932f16}
  *{box-sizing:border-box} body{margin:0;font-family:"Trebuchet MS","Segoe UI",sans-serif;background:linear-gradient(160deg,#f4eee4 0%,#dce8f4 100%);color:var(--ink)}
  button,input,textarea{font:inherit} button{cursor:pointer} button:disabled{opacity:.65;cursor:not-allowed}
  input:focus,textarea:focus{outline:none;box-shadow:0 0 0 3px rgba(216,99,61,.13);border-color:#e39a81}
  .shell{width:min(1220px,calc(100% - 32px));margin:0 auto;padding:24px 0 40px}
  .hero,.card{background:rgba(255,253,249,.93);border:1px solid rgba(23,50,77,.1);border-radius:24px;box-shadow:0 24px 60px rgba(23,50,77,.1)}
  .hero{padding:34px;background:linear-gradient(135deg,#183557 0%,#23557a 60%,#2d7686 100%);color:#fffdf8;position:relative;overflow:hidden}
  .hero:after{content:"";position:absolute;right:-30px;bottom:-50px;width:200px;height:200px;border-radius:999px;background:rgba(255,255,255,.08)}
  .eyebrow,.pill,.badge,.navButton{display:inline-flex;align-items:center;border-radius:999px}
  .topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
  .nav{display:flex;flex-wrap:wrap;gap:10px}
  .navButton{padding:10px 14px;border:1px solid rgba(23,50,77,.12);background:rgba(255,255,255,.72);color:var(--ink);font-weight:700;text-decoration:none}
  .navButton.active{background:var(--ink);color:#fff;border-color:var(--ink)}
  .eyebrow{padding:7px 12px;background:rgba(255,255,255,.12);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
  h1{margin:18px 0 12px;font-size:clamp(2.1rem,5vw,3.8rem);line-height:.95;max-width:760px}
  .hero p{max-width:760px;line-height:1.65;color:rgba(255,253,248,.88);margin:0}
  .heroMeta{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
  .pill{padding:10px 13px;background:rgba(255,255,255,.12);font-size:.93rem}
  .overview,.layout{display:grid;gap:18px;margin-top:18px}
  .overview{grid-template-columns:repeat(4,minmax(0,1fr))}
  .metric{padding:18px}.metricLabel{color:var(--muted);font-size:.86rem}.metricValue{font-size:1.7rem;font-weight:800;margin-top:8px}.metricCopy{margin-top:8px;color:var(--muted);line-height:1.5;font-size:.92rem}
  .layout{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}
  .stack{display:grid;gap:18px}
  .card{padding:22px}
  .cardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}
  .card h2{margin:0;font-size:1.24rem}.copy{margin:6px 0 0;color:var(--muted);line-height:1.6}
  .badge{padding:8px 11px;font-size:.88rem;font-weight:700;white-space:nowrap}.ready{background:var(--ok);color:var(--okText)}.loading{background:var(--warn);color:var(--warnText)}.error{background:var(--err);color:var(--errText)}
  .label{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;font-weight:700;font-size:.95rem}.meta{color:var(--muted);font-weight:600}
  .input,.area,.preview,.widgetWrap{width:100%;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink)}
  .input{padding:14px 15px}.area,.preview{min-height:220px;padding:16px 17px;line-height:1.65}.preview{white-space:pre-wrap;overflow:auto}
  .row,.chips,.sources,.steps{display:flex;flex-wrap:wrap;gap:10px}.row{margin-top:16px}
  .helper,.note{color:var(--muted);font-size:.92rem;line-height:1.55}
  .helper{margin-top:10px}.primary,.secondary,.chip,.source{border-radius:999px}
  .primary{border:none;background:var(--accent);color:#fff;padding:13px 18px;font-weight:800}.secondary{border:1px solid var(--line);background:#fff;padding:12px 16px;font-weight:700;color:var(--ink)}
  .chip{border:1px solid #cfe0e8;background:#eff7fa;padding:10px 13px;color:#1b4f69;text-align:left}
  .source{padding:9px 12px;border:1px solid var(--line);background:#fff}
  .msg{margin-top:16px;padding:13px 15px;border-radius:16px;line-height:1.55}.msg.info{background:#edf6ff;color:#1e4e76}.msg.error{background:var(--err);color:var(--errText)}
  .reply{min-height:250px;margin-top:18px;padding:18px;border-radius:18px;background:linear-gradient(180deg,#f7fbff 0%,#eef4ff 100%);border:1px solid #d9e7f7;white-space:pre-wrap;line-height:1.7}
  .breakdown{display:grid;gap:12px;margin-top:16px}.sourceCard{padding:14px;border:1px solid var(--line);border-radius:18px;background:#fff}.sourceHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.sourceTitle{font-weight:800}.sourceType{padding:6px 10px;border-radius:999px;background:#edf6ff;color:#1e4e76;font-size:.82rem;font-weight:700}.sourceMeta{color:var(--muted);font-size:.88rem;margin-top:4px}.sourcePreview{margin-top:10px;padding:12px;border-radius:14px;background:#f8fbfe;border:1px solid #e1eaf1;white-space:pre-wrap;line-height:1.55;max-height:170px;overflow:auto}
  .logList{display:grid;gap:12px;margin-top:16px}.logCard{padding:14px;border:1px solid var(--line);border-radius:18px;background:#fff}.logQuestion,.logReply{margin-top:10px;padding:12px;border-radius:14px;line-height:1.6;white-space:pre-wrap}.logQuestion{background:#fff3ed;color:#884026}.logReply{background:#edf6ff;color:#17324d}.logMeta,.logSupport{display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:.86rem}.logTag{padding:6px 10px;border-radius:999px;background:#f4f8fb;border:1px solid #dce7f0}
  .widgetWrap{min-height:320px;padding:18px;background:linear-gradient(180deg,#fcfefe 0%,#f4faf9 100%)}
  .widget{width:min(320px,100%);margin-left:auto;padding:15px;border-radius:22px;background:#fff;border:1px solid var(--line);box-shadow:0 16px 36px rgba(23,50,77,.1)}
  .widgetHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.widgetBrand{font-weight:800}.widgetTag{padding:6px 10px;border-radius:999px;background:rgba(47,122,124,.1);color:var(--accent2);font-size:.8rem;font-weight:700}
  .thread{display:grid;gap:10px}.bubble{padding:12px 14px;border-radius:16px;line-height:1.55;font-size:.92rem}.agent{background:#edf6ff}.customer{margin-left:24px;background:#fff3ed;color:#884026}.widgetInput{margin-top:12px;padding:12px 14px;border-radius:14px;background:#f7fafc;border:1px solid #e2eaf1;color:var(--muted)}
  .step{padding:9px 11px;border-radius:14px;background:#fff;border:1px solid var(--line);font-size:.9rem}
  .miniGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
  .miniCard{padding:14px;border:1px solid var(--line);border-radius:18px;background:#fff}
  .miniLabel{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .miniValue{font-size:1rem;font-weight:800;margin-top:6px}
  .checklist{display:grid;gap:10px;margin-top:16px}
  .checkItem{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:16px;background:#fff}
  .checkCopy{font-size:.92rem;color:var(--muted);margin-top:4px;line-height:1.5}
  .checkTitle{font-weight:800}
  .checkState{padding:6px 10px;border-radius:999px;font-size:.8rem;font-weight:800}
  .checkState.ok{background:var(--ok);color:var(--okText)}
  .checkState.warn{background:var(--warn);color:var(--warnText)}
  .split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .toggleRow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:#fff}
  .toggleLabel{font-weight:800}
  .toggleCopy{font-size:.9rem;color:var(--muted);margin-top:4px;line-height:1.5}
  .switch{display:inline-flex;align-items:center;gap:10px;font-weight:700}
  .swatchRow{display:flex;align-items:center;gap:12px}
  .colorInput{width:56px;height:44px;padding:4px;border-radius:12px;border:1px solid var(--line);background:#fff}
  .select{width:100%;padding:14px 15px;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink)}
  .customerPage{display:grid;gap:18px}
  .customerHero{padding:28px}
  .customerHero h1{max-width:none;font-size:clamp(2rem,5vw,3.1rem)}
  .customerStore{position:relative;min-height:720px;padding:28px;border-radius:24px;background:linear-gradient(180deg,#fffefb 0%,#f6f7f9 100%);border:1px solid rgba(23,50,77,.08);box-shadow:0 24px 60px rgba(23,50,77,.08);overflow:hidden}
  .customerStore:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at top left,rgba(47,122,124,.08),transparent 28%)}
  .storeNav,.storeGrid,.storeCards{display:grid;gap:16px;position:relative;z-index:1}
  .storeNav{grid-template-columns:1.1fr auto auto;align-items:center}
  .storeLogo{font-size:1.3rem;font-weight:800;color:var(--ink)}
  .storeNavItem{padding:10px 14px;border-radius:999px;background:#fff;border:1px solid rgba(23,50,77,.08);color:var(--muted);font-size:.9rem}
  .storeGrid{grid-template-columns:1.1fr .9fr;margin-top:24px}
  .storeSpotlight{padding:26px;border-radius:24px;background:linear-gradient(135deg,#1b405f 0%,#2f7a7c 100%);color:#fffdf8;min-height:220px}
  .storeSpotlight h2{margin:0 0 10px;font-size:2rem;line-height:1}
  .storeSpotlight p{margin:0;color:rgba(255,253,248,.86);line-height:1.6}
  .storeCards{grid-template-columns:repeat(2,minmax(0,1fr))}
  .storeCard{padding:18px;border-radius:20px;background:#fff;border:1px solid rgba(23,50,77,.08);min-height:120px}
  .storeCardTitle{font-weight:800;margin-bottom:8px}
  .storeCardCopy{color:var(--muted);line-height:1.55;font-size:.92rem}
  .widgetStage{position:absolute;right:24px;bottom:24px;z-index:2;display:grid;justify-items:end;gap:12px}
  .widgetLauncher{display:inline-flex;align-items:center;gap:10px;padding:12px 16px;border-radius:999px;background:var(--accent);color:#fff;border:none;box-shadow:0 18px 36px rgba(216,99,61,.28);font-weight:800}
  .customerControl{padding:22px}
  .customerField{margin-top:18px}
  .hidden{display:none}
  @media (max-width:1080px){.overview{grid-template-columns:repeat(2,minmax(0,1fr))}.layout,.storeGrid{grid-template-columns:1fr}.widgetStage{position:relative;right:auto;bottom:auto;justify-items:stretch;margin-top:20px}.widget{margin-left:0}}
  @media (max-width:720px){.overview,.storeCards,.miniGrid,.split{grid-template-columns:1fr}.cardHead,.label,.sourceHead,.storeNav,.toggleRow,.checkItem{flex-direction:column;align-items:flex-start}.hero,.customerHero,.customerStore{padding:28px 24px}}
`;

function buildKnowledgeSources({ policy, faqContent, faqFileName }) {
  return [
    policy.trim()
      ? {
          id: 'knowledge-base',
          type: 'knowledge_base',
          label: 'Knowledge Base',
          name: 'Unified merchant knowledge',
          content: policy.trim(),
        }
      : null,
    faqContent.trim()
      ? {
          id: 'faq-upload',
          type: 'faq_file',
          label: 'FAQ File',
          name: faqFileName || 'Uploaded FAQ file',
          content: faqContent.trim(),
        }
      : null,
  ].filter(Boolean);
}

function formatShopifySourcesForKnowledgeBox(sources, shopDomain) {
  const lines = [`Shopify sync source: ${shopDomain || 'Connected store'}`];
  sources.forEach((source, index) => {
    lines.push(`Source ${index + 1}
Type: ${source.label}
Name: ${source.name}
Content:
${source.content}`);
  });
  return lines.join('\n\n');
}

function summarize(text) {
  const value = text.trim();
  return value.length <= 280 ? value : `${value.slice(0, 280)}...`;
}

function formatTimestamp(value) {
  if (!value) {
    return 'Unknown time';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function normalizeUsageStatsPayload(payload) {
  const stats = payload && payload.stats && typeof payload.stats === 'object' ? payload.stats : {};
  return {
    totalQuestions: stats.totalQuestions || 0,
    storefrontQuestions: stats.storefrontQuestions || 0,
    merchantTestQuestions: stats.merchantTestQuestions || 0,
    cachedRepliesServed: stats.cachedRepliesServed || 0,
    lastAskedAt: stats.lastAskedAt || null,
    todayCount: payload && typeof payload.todayCount === 'number' ? payload.todayCount : 0,
  };
}

function normalizeBillingPayload(payload) {
  const summary = payload && payload.summary && typeof payload.summary === 'object' ? payload.summary : {};
  return {
    enabled: Boolean(summary.enabled),
    planName: summary.planName || 'StoreReply Pro',
    recurringPriceLabel: summary.recurringPriceLabel || '$19.00',
    interval: summary.interval || 'EVERY_30_DAYS',
    status: summary.status || 'INACTIVE',
    currentPeriodEnd: summary.currentPeriodEnd || null,
    test: Boolean(summary.test),
    trialDays: typeof summary.trialDays === 'number' ? summary.trialDays : 0,
  };
}

function App() {
  const initialSurface =
    window.location.hash.replace('#', '') === 'customer' ? 'customer' : 'merchant';
  const [surface, setSurface] = useState(initialSurface);
  const [policy, setPolicy] = useState('');
  const [policyTemplate, setPolicyTemplate] = useState('');
  const [faqTemplate, setFaqTemplate] = useState('');
  const [faqContent, setFaqContent] = useState('');
  const [faqFileName, setFaqFileName] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [shopifyReady, setShopifyReady] = useState(false);
  const [shopifyMissing, setShopifyMissing] = useState([]);
  const [shopifyStatus, setShopifyStatus] = useState({ connected: false, knowledgeSourceCount: 0, syncedAt: null });
  const [shopifySources, setShopifySources] = useState([]);
  const [conversationLogs, setConversationLogs] = useState([]);
  const [usageStats, setUsageStats] = useState({
    totalQuestions: 0,
    storefrontQuestions: 0,
    merchantTestQuestions: 0,
    cachedRepliesServed: 0,
    lastAskedAt: null,
    todayCount: 0,
  });
  const [billing, setBilling] = useState({
    enabled: false,
    planName: 'StoreReply Pro',
    recurringPriceLabel: '$19.00',
    interval: 'EVERY_30_DAYS',
    status: 'INACTIVE',
    currentPeriodEnd: null,
    test: true,
    trialDays: 7,
  });
  const [merchantSettings, setMerchantSettings] = useState({
    assistantName: 'StoreReply Support',
    welcomeMessage: 'Hi there. Ask a question about shipping, returns, exchanges, or your order.',
    placeholderText: 'Type your question...',
    accentColor: '#d8633d',
    tone: 'friendly',
    botEnabled: true,
  });
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState('Your AI-generated customer reply will appear here.');
  const [bootStatus, setBootStatus] = useState('loading');
  const [isAsking, setIsAsking] = useState(false);
  const [isSyncingShopify, setIsSyncingShopify] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('Preparing your merchant dashboard.');

  useEffect(() => {
    async function load() {
      setBootStatus('loading');
      try {
        const [templateResponse, shopifyConfigResponse, sessionResponse] = await Promise.all([
          fetch('/api/merchant-knowledge-template'),
          fetch('/api/shopify/config'),
          fetch('/api/session'),
        ]);
        const templateData = await templateResponse.json();
        const shopifyConfigData = await shopifyConfigResponse.json();
        const sessionData = await sessionResponse.json();
        if (!templateResponse.ok) {
          throw new Error(templateData.error || 'Could not load merchant dashboard templates.');
        }
        const sourceTemplates = Array.isArray(templateData.sourceTemplates) ? templateData.sourceTemplates : [];
        setPolicyTemplate(sourceTemplates.find((source) => source.type === 'store_policy')?.content || '');
        setFaqTemplate(sourceTemplates.find((source) => source.type === 'faq_file')?.content || '');
        setShopifyReady(Boolean(shopifyConfigData.ready));
        setShopifyMissing(Array.isArray(shopifyConfigData.missing) ? shopifyConfigData.missing : []);
        const sessionShop = typeof sessionData.shop === 'string' ? sessionData.shop : '';
        if (sessionShop) {
          setShopDomain(sessionShop);
        }
        loadDashboardData(sessionShop);
        setBootStatus('ready');
        setInfoMessage('Connect a store, sync knowledge, test replies, and preview the customer widget.');
      } catch (loadError) {
        setBootStatus('error');
        setInfoMessage('');
        setError(loadError.message || 'Could not load merchant dashboard templates.');
      }
    }
    load();
  }, []);

  useEffect(() => {
    function syncSurfaceFromHash() {
      setSurface(window.location.hash.replace('#', '') === 'customer' ? 'customer' : 'merchant');
    }

    window.addEventListener('hashchange', syncSurfaceFromHash);
    return () => window.removeEventListener('hashchange', syncSurfaceFromHash);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedShop = params.get('shop');
    const connectedFlag = params.get('shopify');
    const billingFlag = params.get('billing');
    if (connectedShop) {
      setShopDomain(connectedShop);
      loadDashboardData(connectedShop);
    }
    if (connectedFlag === 'connected') {
      setInfoMessage(`Shopify connected for ${connectedShop || 'your store'}. You can sync knowledge now.`);
    }
    if (billingFlag === 'confirmed') {
      setInfoMessage('Subscription approval returned to the app. Refreshing billing status now.');
    }
    if (connectedFlag === 'connected' || billingFlag === 'confirmed') {
      params.delete('shop');
      params.delete('shopify');
      params.delete('billing');
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

  useEffect(() => {
    const activeShop = shopDomain.trim();

    if (!activeShop || surface !== 'merchant') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadDashboardData(activeShop, { silent: true });
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [shopDomain, surface]);

  async function fetchShopifyStatus(shop) {
    if (!shop.trim()) {
      setShopifyStatus({ connected: false, knowledgeSourceCount: 0, syncedAt: null });
      return;
    }
    try {
      const response = await fetch(`/api/shopify/status?shop=${encodeURIComponent(shop.trim())}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not load Shopify connection status.');
      }
      setShopifyStatus(data);
    } catch (statusError) {
      setError(statusError.message || 'Could not load Shopify connection status.');
    }
  }

  async function loadDashboardData(shop, options = {}) {
    try {
      const query = shop.trim() ? `?shop=${encodeURIComponent(shop.trim())}` : '';
      const response = await fetch(`/api/dashboard-bootstrap${query}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not load merchant dashboard data.');
      }

      if (data.shopifyStatus && typeof data.shopifyStatus === 'object') {
        setShopifyStatus(data.shopifyStatus);
      }

      if (data.settings && typeof data.settings === 'object') {
        setMerchantSettings((current) => ({
          ...current,
          ...data.settings,
        }));
      }

      setConversationLogs(Array.isArray(data.conversations) ? data.conversations : []);
      setUsageStats(normalizeUsageStatsPayload(data.usage));
      setBilling(normalizeBillingPayload(data.billing));
    } catch (dashboardError) {
      if (!options.silent) {
        setError(dashboardError.message || 'Could not load merchant dashboard data.');
      }
    }
  }

  async function loadMerchantSettings(shop) {
    try {
      const query = shop.trim() ? `?shop=${encodeURIComponent(shop.trim())}` : '';
      const response = await fetch(`/api/merchant-settings${query}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not load merchant settings.');
      }

      setMerchantSettings((current) => ({
        ...current,
        ...(data.settings && typeof data.settings === 'object' ? data.settings : {}),
      }));
    } catch (settingsError) {
      setError(settingsError.message || 'Could not load merchant settings.');
    }
  }

  async function loadConversationHistory(shop) {
    try {
      const query = shop.trim() ? `?shop=${encodeURIComponent(shop.trim())}` : '';
      const response = await fetch(`/api/conversations${query}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not load conversation history.');
      }

      setConversationLogs(Array.isArray(data.conversations) ? data.conversations : []);
    } catch (historyError) {
      setError(historyError.message || 'Could not load conversation history.');
    }
  }

  async function loadUsageStats(shop) {
    try {
      const query = shop.trim() ? `?shop=${encodeURIComponent(shop.trim())}` : '';
      const response = await fetch(`/api/usage-stats${query}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not load usage stats.');
      }

      const stats = data.stats && typeof data.stats === 'object' ? data.stats : {};
      setUsageStats({
        totalQuestions: stats.totalQuestions || 0,
        storefrontQuestions: stats.storefrontQuestions || 0,
        merchantTestQuestions: stats.merchantTestQuestions || 0,
        cachedRepliesServed: stats.cachedRepliesServed || 0,
        lastAskedAt: stats.lastAskedAt || null,
        todayCount: typeof data.todayCount === 'number' ? data.todayCount : 0,
      });
    } catch (usageError) {
      setError(usageError.message || 'Could not load usage stats.');
    }
  }

  const knowledgeSources = buildKnowledgeSources({ policy, faqContent, faqFileName });

  async function handleAsk(event) {
    event.preventDefault();
    if (!question.trim()) {
      setError('Enter a customer question before asking the support agent.');
      return;
    }
    if (!knowledgeSources.length) {
      setError('Add merchant knowledge before asking a question.');
      return;
    }
    setError('');
    setInfoMessage('Testing the support reply against your merchant knowledge.');
    setIsAsking(true);
    setReply('Generating an answer...');
    try {
      const response = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeSources,
          question: question.trim(),
          shop: shopDomain.trim(),
          channel: 'merchant_test',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'The support agent request failed.');
      }
      const sourceCount = typeof data.knowledgeSourceCount === 'number' ? data.knowledgeSourceCount : knowledgeSources.length;
      setReply(data.reply || 'No reply was returned.');
      loadDashboardData(shopDomain.trim(), { silent: true });
      setInfoMessage(`Reply generated successfully from ${sourceCount} merchant knowledge source${sourceCount === 1 ? '' : 's'}.`);
    } catch (requestError) {
      setReply('Your AI-generated customer reply will appear here.');
      setInfoMessage('');
      setError(requestError.message || 'The support agent request failed.');
    } finally {
      setIsAsking(false);
    }
  }

  async function handleConnectShopify() {
    if (!shopDomain.trim()) {
      setError('Enter a Shopify store domain like example-store.myshopify.com.');
      return;
    }
    setError('');
    setInfoMessage(`Starting Shopify install for ${shopDomain.trim()}.`);
    try {
      const response = await fetch(`/api/shopify/start?shop=${encodeURIComponent(shopDomain.trim())}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not start Shopify install.');
      }
      window.location.assign(data.authUrl);
    } catch (connectError) {
      setInfoMessage('');
      setError(connectError.message || 'Could not start Shopify install.');
    }
  }

  async function handleSyncShopify() {
    if (!shopDomain.trim()) {
      setError('Enter a Shopify store domain before syncing.');
      return;
    }
    setError('');
    setInfoMessage(`Syncing Shopify content from ${shopDomain.trim()}.`);
    setIsSyncingShopify(true);
    try {
      const response = await fetch('/api/shopify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: shopDomain.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Shopify sync failed.');
      }
      const syncedSources = Array.isArray(data.knowledgeSources) ? data.knowledgeSources : [];
      setShopifySources(syncedSources);
      if (syncedSources.length) {
        setPolicy(formatShopifySourcesForKnowledgeBox(syncedSources, shopDomain.trim()));
      }
      setShopifyStatus({
        connected: true,
        knowledgeSourceCount: data.knowledgeSourceCount || 0,
        syncedAt: data.syncedAt || null,
      });
      loadDashboardData(shopDomain.trim(), { silent: true });
      setInfoMessage(
        data.warning
          ? `${data.warning} Imported ${data.knowledgeSourceCount || 0} knowledge source${data.knowledgeSourceCount === 1 ? '' : 's'} into the main knowledge base.`
          : `Shopify sync complete. Imported ${data.knowledgeSourceCount || 0} knowledge source${data.knowledgeSourceCount === 1 ? '' : 's'} into the main knowledge base.`
      );
    } catch (syncError) {
      setInfoMessage('');
      setError(syncError.message || 'Shopify sync failed.');
    } finally {
      setIsSyncingShopify(false);
    }
  }

  async function handleSaveMerchantSettings() {
    setError('');
    setInfoMessage('Saving merchant settings.');
    setIsSavingSettings(true);

    try {
      const response = await fetch('/api/merchant-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shopDomain.trim(),
          settings: merchantSettings,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not save merchant settings.');
      }

      setMerchantSettings((current) => ({
        ...current,
        ...(data.settings && typeof data.settings === 'object' ? data.settings : {}),
      }));
      setInfoMessage('Merchant settings saved.');
    } catch (settingsError) {
      setInfoMessage('');
      setError(settingsError.message || 'Could not save merchant settings.');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleStartBilling() {
    if (!shopDomain.trim()) {
      setError('Enter a Shopify store domain before starting billing.');
      return;
    }

    setError('');
    setInfoMessage('Preparing the Shopify subscription approval screen.');

    try {
      const response = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: shopDomain.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not start the subscription flow.');
      }

      if (data.alreadyActive) {
        setInfoMessage('This store already has an active StoreReply subscription.');
        loadDashboardData(shopDomain.trim(), { silent: true });
        return;
      }

      if (!data.confirmationUrl) {
        throw new Error('Shopify did not return a subscription confirmation URL.');
      }

      window.location.assign(data.confirmationUrl);
    } catch (billingError) {
      setInfoMessage('');
      setError(billingError.message || 'Could not start the subscription flow.');
    }
  }

  async function handleReviewConversation(conversationId, reviewStatus) {
    try {
      const response = await fetch('/api/conversations/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shopDomain.trim(),
          conversationId,
          reviewStatus,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not update the conversation review.');
      }

      setInfoMessage('Conversation review updated.');
      loadDashboardData(shopDomain.trim(), { silent: true });
    } catch (reviewError) {
      setInfoMessage('');
      setError(reviewError.message || 'Could not update the conversation review.');
    }
  }

  function handleQuickQuestion(nextQuestion) {
    setQuestion(nextQuestion);
    setError('');
    setInfoMessage('Sample customer question loaded.');
  }

  function handleUseTemplate() {
    setPolicy(policyTemplate);
    setError('');
    setInfoMessage('Starter template loaded into the knowledge base.');
  }

  function handleClearPolicy() {
    setPolicy('');
    setError('');
    setInfoMessage('Knowledge base cleared.');
  }

  function handleClearQuestion() {
    setQuestion('');
    setError('');
    setInfoMessage('Question cleared.');
  }

  function handleClearFaq() {
    setFaqContent('');
    setFaqFileName('');
    setError('');
    setInfoMessage('FAQ upload removed.');
  }

  function handleFaqUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError('');
    setInfoMessage(`Reading ${file.name}.`);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text.trim()) {
        setFaqContent('');
        setFaqFileName('');
        setError('The selected FAQ file is empty.');
        setInfoMessage('');
        return;
      }
      setFaqContent(text);
      setFaqFileName(file.name);
      setInfoMessage(`${file.name} uploaded successfully as a supporting FAQ source.`);
    };
    reader.onerror = () => {
      setFaqContent('');
      setFaqFileName('');
      setError('The FAQ file could not be read. Try a plain text, markdown, CSV, or JSON file.');
      setInfoMessage('');
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  const policyWordCount = policy.trim() ? policy.trim().split(/\s+/).length : 0;
  const faqWordCount = faqContent.trim() ? faqContent.trim().split(/\s+/).length : 0;
  const questionLength = question.trim().length;
  const dashboardStatus = bootStatus === 'ready' ? 'Dashboard ready' : bootStatus === 'loading' ? 'Loading dashboard' : 'Setup issue';
  const widgetPreviewReply =
    reply !== 'Your AI-generated customer reply will appear here.' && reply !== 'Generating an answer...'
      ? reply
      : 'Yes, we can help with that. We will answer from your synced store knowledge here.';
  const operations = [
    {
      title: 'Store connected',
      copy: shopifyStatus.connected
        ? `Connected to ${shopDomain || 'your Shopify store'}.`
        : 'Connect a Shopify store before syncing or testing anything live.',
      complete: shopifyStatus.connected,
    },
    {
      title: 'Knowledge synced',
      copy: shopifyStatus.knowledgeSourceCount
        ? `${shopifyStatus.knowledgeSourceCount} Shopify source${shopifyStatus.knowledgeSourceCount === 1 ? '' : 's'} imported.`
        : 'Run a Shopify sync so the assistant has grounded store content.',
      complete: Boolean(shopifyStatus.knowledgeSourceCount),
    },
    {
      title: 'Merchant defaults saved',
      copy: merchantSettings.assistantName && merchantSettings.welcomeMessage
        ? 'Assistant voice and greeting are configured.'
        : 'Save the assistant name and welcome message merchants want customers to see.',
      complete: Boolean(merchantSettings.assistantName && merchantSettings.welcomeMessage),
    },
    {
      title: 'Bot live state',
      copy: merchantSettings.botEnabled
        ? 'The support agent is enabled and ready for storefront questions.'
        : 'The bot is paused. Merchants can keep settings saved while the storefront stays quiet.',
      complete: merchantSettings.botEnabled,
    },
  ];
  const widgetAccentStyle = {
    borderColor: merchantSettings.accentColor || '#d8633d',
    boxShadow: `0 16px 36px ${merchantSettings.accentColor || '#d8633d'}22`,
  };
  const launcherStyle = {
    background: merchantSettings.accentColor || '#d8633d',
  };
  const nextBestAction = !shopDomain.trim()
    ? 'Enter a Shopify store domain to activate merchant-specific settings and tracking.'
    : !shopifyStatus.connected
      ? 'Connect Shopify so the dashboard can sync real store knowledge.'
      : !shopifyStatus.knowledgeSourceCount
        ? 'Run a Shopify sync to import policies and pages into the knowledge base.'
        : !merchantSettings.botEnabled
          ? 'Re-enable the support agent when you are ready to expose it on the storefront.'
          : 'Test a real customer question and review the reply in the merchant test center.';
  const visibleConversationLogs = conversationLogs.filter((entry) => {
    const reviewStatus = entry.reviewStatus || 'unreviewed';
    const matchesFilter = historyFilter === 'all' ? true : reviewStatus === historyFilter;
    const haystack = `${entry.question || ''} ${entry.reply || ''}`.toLowerCase();
    const matchesSearch = !historySearch.trim() || haystack.includes(historySearch.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <>
      <style>{styles}</style>
      <div className="shell">
        <div className="topbar">
          <div className="eyebrow">StoreReply Surfaces</div>
          <div className="nav">
            <a
              className={`navButton ${surface === 'merchant' ? 'active' : ''}`}
              href="#merchant"
              onClick={() => setSurface('merchant')}
            >
              Merchant dashboard
            </a>
            <a
              className={`navButton ${surface === 'customer' ? 'active' : ''}`}
              href="#customer"
              onClick={() => setSurface('customer')}
            >
              Customer support UI
            </a>
          </div>
        </div>
        {surface === 'customer' ? (
          <div className="customerPage">
            <section className="hero customerHero">
              <div className="eyebrow">Customer Support UI</div>
              <h1>Embedded storefront chat, powered by the same synced merchant knowledge.</h1>
              <p>
                This is still a test surface, but it now mimics the real shopper experience much more
                closely. Shoppers do not see Shopify sync, knowledge cards, or merchant controls.
              </p>
            </section>

            <section className="customerStore">
              <div className="storeNav">
                <div className="storeLogo">Lumiere Studios</div>
                <div className="storeNavItem">Spring edit</div>
                <div className="storeNavItem">Need help?</div>
              </div>
              <div className="storeGrid">
                <div className="storeSpotlight">
                  <h2>Customer support that feels native to the storefront.</h2>
                  <p>
                    In the real app, the merchant syncs Shopify content in the dashboard and the
                    shopper only sees this lightweight support experience on the storefront.
                  </p>
                </div>
                <div className="storeCards">
                  <div className="storeCard">
                    <div className="storeCardTitle">Shipping</div>
                    <div className="storeCardCopy">Customers ask where their orders are and what delivery timelines to expect.</div>
                  </div>
                  <div className="storeCard">
                    <div className="storeCardTitle">Returns</div>
                    <div className="storeCardCopy">The assistant should answer clearly from refund, exchange, and damaged-item policies.</div>
                  </div>
                  <div className="storeCard">
                    <div className="storeCardTitle">Order help</div>
                    <div className="storeCardCopy">Cancellation windows, address updates, and support hours should all come from synced store knowledge.</div>
                  </div>
                  <div className="storeCard">
                    <div className="storeCardTitle">Privacy</div>
                    <div className="storeCardCopy">If the merchant has policy content, the assistant can answer data-handling questions from those official pages too.</div>
                  </div>
                </div>
              </div>

              <div className="widgetStage">
                <button type="button" className="widgetLauncher">Open support chat</button>
                <div className="widget">
                  <div className="widgetHead">
                    <div className="widgetBrand">StoreReply Support</div>
                    <div className="widgetTag">Embedded widget</div>
                  </div>
                  <div className="thread">
                    <div className="bubble agent">{merchantSettings.welcomeMessage}</div>
                    <div className="bubble customer">
                      {question.trim() || 'Can I return a damaged item?'}
                    </div>
                    <div className="bubble agent">{widgetPreviewReply}</div>
                  </div>
                  <div className="widgetInput">{merchantSettings.placeholderText}</div>
                </div>
              </div>
            </section>

            <section className="card customerControl">
              <div className="cardHead">
                <div>
                  <h2>Customer surface tester</h2>
                  <div className="copy">
                    Use this panel to simulate shopper questions while you refine the storefront
                    widget. The real production embed would be added after the merchant app is finalized.
                  </div>
                </div>
                <div className={`badge ${knowledgeSources.length ? 'ready' : 'error'}`}>
                  {knowledgeSources.length ? 'Knowledge ready' : 'No merchant knowledge loaded'}
                </div>
              </div>

              <div className="note">
                Customer-facing chat stays simple. If the merchant needs to sync or edit knowledge,
                switch back to the merchant dashboard.
              </div>

              <form onSubmit={handleAsk} className="customerField">
                <label className="label" htmlFor="customer-question">
                  <span>Customer question</span>
                  <span className="meta">{questionLength} characters</span>
                </label>
                <input
                  id="customer-question"
                  className="input"
                  type="text"
                  placeholder="Example: Can I return a damaged item?"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  disabled={isAsking}
                />
                <div className="chips" style={{ marginTop: '12px' }}>
                  {quickQuestions.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      className="chip"
                      onClick={() => handleQuickQuestion(sample)}
                      disabled={isAsking}
                    >
                      {sample}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button
                    type="submit"
                    className="primary"
                    disabled={isAsking || !question.trim() || !knowledgeSources.length}
                  >
                    {isAsking ? 'Generating reply...' : 'Ask support'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleClearQuestion}
                    disabled={isAsking || !question}
                  >
                    Clear question
                  </button>
                </div>
              </form>

              {error ? <div className="msg error">{error}</div> : null}
              {!error && infoMessage ? <div className="msg info">{infoMessage}</div> : null}

              <div className="reply">{reply}</div>
            </section>
          </div>
        ) : (
          <>
        <section className="hero">
          <div className="eyebrow">StoreReply Merchant Dashboard</div>
          <h1>Run the merchant app here. Keep the shopper-facing support UI simple later.</h1>
          <p>
            This dashboard is the owner experience: connect Shopify, sync the store knowledge base,
            test replies, and preview the future customer support widget that will sit on the storefront.
          </p>
          <div className="heroMeta">
            <div className="pill">Merchant dashboard</div>
            <div className="pill">Unified knowledge base</div>
            <div className="pill">Future customer widget</div>
          </div>
        </section>

        <section className="overview">
          <div className="metric hero card">
            <div className="metricLabel">Connection status</div>
            <div className="metricValue">{shopifyStatus.connected ? 'Live' : 'Pending'}</div>
            <div className="metricCopy">{shopifyStatus.connected ? `Connected to ${shopDomain || 'your Shopify store'}.` : 'Connect a Shopify store to start syncing merchant knowledge.'}</div>
          </div>
          <div className="metric card">
            <div className="metricLabel">Shopify sources</div>
            <div className="metricValue">{shopifyStatus.knowledgeSourceCount || 0}</div>
            <div className="metricCopy">Imported Shopify pages and policies currently available to the merchant knowledge base.</div>
          </div>
          <div className="metric card">
            <div className="metricLabel">Knowledge words</div>
            <div className="metricValue">{policyWordCount}</div>
            <div className="metricCopy">Words currently loaded into the main knowledge base the assistant uses.</div>
          </div>
          <div className="metric card">
            <div className="metricLabel">Widget preview</div>
            <div className="metricValue">{question.trim() ? 'Ready' : 'Draft'}</div>
            <div className="metricCopy">The future storefront widget can reuse the same answer engine with a simpler UI.</div>
          </div>
        </section>

        <div className="layout">
          <div className="stack">
            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Merchant operations center</h2>
                  <div className="copy">This is the day-to-day checklist merchants should be able to run without guesswork: connect the store, sync knowledge, set defaults, then monitor live support traffic.</div>
                </div>
                <div className="badge ready">Control center</div>
              </div>
              <div className="miniGrid">
                <div className="miniCard">
                  <div className="miniLabel">Next best action</div>
                  <div className="miniValue">{nextBestAction}</div>
                </div>
                <div className="miniCard">
                  <div className="miniLabel">Where merchants change things</div>
                  <div className="miniValue">App dashboard for behavior. Shopify theme editor for storefront appearance.</div>
                </div>
              </div>
              <div className="checklist">
                {operations.map((item) => (
                  <div key={item.title} className="checkItem">
                    <div>
                      <div className="checkTitle">{item.title}</div>
                      <div className="checkCopy">{item.copy}</div>
                    </div>
                    <div className={`checkState ${item.complete ? 'ok' : 'warn'}`}>
                      {item.complete ? 'Ready' : 'Needs action'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Shopify onboarding</h2>
                  <div className="copy">This is the merchant installation flow: connect the store, sync knowledge, and verify the app is grounded on the right content.</div>
                </div>
                <div className={`badge ${shopifyReady ? 'ready' : shopifyMissing.length ? 'error' : 'loading'}`}>{shopifyReady ? 'Shopify ready' : 'Configure env'}</div>
              </div>
              <label className="label" htmlFor="shop-domain">
                <span>Shopify store domain</span>
                <span className="meta">{shopifyStatus.connected ? 'Connected' : 'Not connected'}</span>
              </label>
              <input id="shop-domain" className="input" type="text" placeholder="example-store.myshopify.com" value={shopDomain} onChange={(event) => setShopDomain(event.target.value)} disabled={isAsking || isSyncingShopify} />
              <div className="helper">{shopifyReady ? 'Use a development store first, then reconnect and resync as needed.' : `Missing env vars: ${shopifyMissing.join(', ') || 'Shopify settings not loaded.'}`}</div>
              <div className="row">
                <button type="button" className="secondary" onClick={handleConnectShopify} disabled={!shopifyReady || !shopDomain.trim() || isSyncingShopify || isAsking}>Connect Shopify</button>
                <button type="button" className="secondary" onClick={handleSyncShopify} disabled={!shopifyReady || !shopDomain.trim() || !shopifyStatus.connected || isSyncingShopify || isAsking}>{isSyncingShopify ? 'Syncing Shopify...' : 'Sync Shopify data'}</button>
                <button type="button" className="secondary" onClick={() => fetchShopifyStatus(shopDomain)} disabled={!shopDomain.trim() || isSyncingShopify || isAsking}>Refresh status</button>
              </div>
              <div className="note">{shopifyStatus.syncedAt ? `Last Shopify sync: ${shopifyStatus.syncedAt}` : 'No Shopify sync has been recorded yet for this store.'}</div>
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Merchant knowledge base</h2>
                  <div className="copy">Keep this as the single thing merchants understand. Shopify sync fills it automatically, and manual edits become overrides instead of a separate workflow.</div>
                </div>
                <div className={`badge ${bootStatus === 'ready' ? 'ready' : bootStatus === 'loading' ? 'loading' : 'error'}`}>{dashboardStatus}</div>
              </div>
              <label className="label" htmlFor="policy">
                <span>Main knowledge content</span>
                <span className="meta">{policyWordCount} words</span>
              </label>
              <textarea id="policy" className="area" value={policy} onChange={(event) => setPolicy(event.target.value)} disabled={bootStatus === 'loading' || isAsking} placeholder="Sync Shopify to auto-fill this knowledge base, or paste merchant rules manually." />
              <div className="helper">{bootStatus === 'loading' ? 'Loading dashboard template.' : 'This is the unified box the support agent answers from during merchant testing.'}</div>
              <div className="row">
                <button type="button" className="secondary" onClick={handleUseTemplate} disabled={bootStatus !== 'ready' || isAsking || !policyTemplate}>Load starter template</button>
                <button type="button" className="secondary" onClick={handleClearPolicy} disabled={isAsking || !policy}>Clear knowledge base</button>
              </div>
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Merchant settings</h2>
                  <div className="copy">These settings belong to your app dashboard and remain the source of truth for widget behavior and customer-facing copy. Shopify theme editor controls only storefront layout and appearance.</div>
                </div>
                <div className={`badge ${isSavingSettings ? 'loading' : 'ready'}`}>{isSavingSettings ? 'Saving...' : 'App settings'}</div>
              </div>

              <label className="label" htmlFor="assistant-name">
                <span>Assistant name</span>
                <span className="meta">Customer-facing</span>
              </label>
              <input
                id="assistant-name"
                className="input"
                type="text"
                value={merchantSettings.assistantName}
                onChange={(event) =>
                  setMerchantSettings((current) => ({
                    ...current,
                    assistantName: event.target.value,
                  }))
                }
                disabled={isSavingSettings}
              />

              <label className="label" htmlFor="welcome-message" style={{ marginTop: '16px' }}>
                <span>Welcome message</span>
                <span className="meta">Widget greeting</span>
              </label>
              <textarea
                id="welcome-message"
                className="area"
                style={{ minHeight: '120px' }}
                value={merchantSettings.welcomeMessage}
                onChange={(event) =>
                  setMerchantSettings((current) => ({
                    ...current,
                    welcomeMessage: event.target.value,
                  }))
                }
                disabled={isSavingSettings}
              />

              <label className="label" htmlFor="placeholder-text" style={{ marginTop: '16px' }}>
                <span>Input placeholder</span>
                <span className="meta">Customer prompt</span>
              </label>
              <input
                id="placeholder-text"
                className="input"
                type="text"
                value={merchantSettings.placeholderText}
                onChange={(event) =>
                  setMerchantSettings((current) => ({
                    ...current,
                    placeholderText: event.target.value,
                  }))
                }
                disabled={isSavingSettings}
              />

              <div className="split" style={{ marginTop: '16px' }}>
                <div>
                  <label className="label" htmlFor="tone">
                    <span>Reply tone</span>
                    <span className="meta">Support personality</span>
                  </label>
                  <select
                    id="tone"
                    className="select"
                    value={merchantSettings.tone}
                    onChange={(event) =>
                      setMerchantSettings((current) => ({
                        ...current,
                        tone: event.target.value,
                      }))
                    }
                    disabled={isSavingSettings}
                  >
                    <option value="friendly">Friendly</option>
                    <option value="concise">Concise</option>
                    <option value="reassuring">Reassuring</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="accent-color">
                    <span>Brand accent</span>
                    <span className="meta">Widget default</span>
                  </label>
                  <div className="swatchRow">
                    <input
                      id="accent-color"
                      className="colorInput"
                      type="color"
                      value={merchantSettings.accentColor}
                      onChange={(event) =>
                        setMerchantSettings((current) => ({
                          ...current,
                          accentColor: event.target.value,
                        }))
                      }
                      disabled={isSavingSettings}
                    />
                    <input
                      className="input"
                      type="text"
                      value={merchantSettings.accentColor}
                      onChange={(event) =>
                        setMerchantSettings((current) => ({
                          ...current,
                          accentColor: event.target.value,
                        }))
                      }
                      disabled={isSavingSettings}
                    />
                  </div>
                </div>
              </div>

              <div className="toggleRow" style={{ marginTop: '16px' }}>
                <div>
                  <div className="toggleLabel">Bot live state</div>
                  <div className="toggleCopy">Merchants can pause storefront replies without losing knowledge, logs, or saved settings.</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={merchantSettings.botEnabled}
                    onChange={(event) =>
                      setMerchantSettings((current) => ({
                        ...current,
                        botEnabled: event.target.checked,
                      }))
                    }
                    disabled={isSavingSettings}
                  />
                  {merchantSettings.botEnabled ? 'Enabled' : 'Paused'}
                </label>
              </div>

              <div className="row">
                <button type="button" className="primary" onClick={handleSaveMerchantSettings} disabled={isSavingSettings}>
                  {isSavingSettings ? 'Saving settings...' : 'Save widget settings'}
                </button>
              </div>
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Supporting FAQs</h2>
                  <div className="copy">Add extra merchant guidance or exceptions that Shopify does not contain yet.</div>
                </div>
                <div className={`badge ${faqContent ? 'ready' : 'loading'}`}>{faqContent ? 'FAQ loaded' : 'FAQ optional'}</div>
              </div>
              <label className="label" htmlFor="faq-upload">
                <span>FAQ file</span>
                <span className="meta">{faqWordCount} words</span>
              </label>
              <input id="faq-upload" className="hidden" type="file" accept={supportedFileTypes} onChange={handleFaqUpload} disabled={isAsking} />
              <div className="row" style={{ marginTop: 0 }}>
                <label htmlFor="faq-upload" className="secondary">Upload FAQ file</label>
                <button type="button" className="secondary" onClick={handleClearFaq} disabled={isAsking || !faqContent}>Remove FAQ</button>
              </div>
              <div className="helper">Optional supporting content for edge cases, exceptions, or temporary support guidance.</div>
              <div className="label" style={{ marginTop: '18px' }}>
                <span>{faqFileName || 'No FAQ file loaded yet'}</span>
                <span className="meta">{faqContent ? 'Preview below' : 'Support content'}</span>
              </div>
              <div className="preview">{faqContent || faqTemplate || 'Upload a FAQ file to preview its contents here.'}</div>
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Ownership split</h2>
                  <div className="copy">This keeps merchants from accidentally overwriting the same setting in two places.</div>
                </div>
                <div className="badge ready">Safe controls</div>
              </div>
              <div className="miniGrid">
                <div className="miniCard">
                  <div className="miniLabel">Change here in the app</div>
                  <div className="miniValue">Knowledge sync, assistant defaults, support tone, live state, logs, and usage tracking.</div>
                </div>
                <div className="miniCard">
                  <div className="miniLabel">Change in Shopify theme editor</div>
                  <div className="miniValue">Widget position, launcher label, subtitle, accent color, panel size, corners, and mobile visibility.</div>
                </div>
              </div>
            </section>
          </div>

          <div className="stack">
            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Synced Shopify breakdown</h2>
                  <div className="copy">This is for merchant trust and debugging only. It shows which policies and pages were imported before they were folded into the unified knowledge base above.</div>
                </div>
                <div className={`badge ${shopifySources.length ? 'ready' : 'loading'}`}>{shopifySources.length ? 'Sources loaded' : 'Awaiting sync'}</div>
              </div>
              <div className="sources">
                {shopifySources.length ? shopifySources.map((source) => <div key={source.id} className="source">{source.label}: {source.name}</div>) : <div className="source">No synced Shopify sources yet</div>}
              </div>
              {shopifySources.length ? (
                <div className="breakdown">
                  {shopifySources.map((source) => (
                    <div key={source.id} className="sourceCard">
                      <div className="sourceHead">
                        <div>
                          <div className="sourceTitle">{source.name}</div>
                          <div className="sourceMeta">{source.sourceShop || shopDomain || 'Connected Shopify store'}</div>
                        </div>
                        <div className="sourceType">{source.label}</div>
                      </div>
                      <div className="sourcePreview">{summarize(source.content)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="note">Once a merchant syncs Shopify, individual policies and pages will show up here.</div>
              )}
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Merchant test center</h2>
                  <div className="copy">Store owners can test realistic support questions here before exposing anything to customers.</div>
                </div>
                <div className={`badge ${isAsking ? 'loading' : knowledgeSources.length ? 'ready' : 'error'}`}>{isAsking ? 'Generating reply' : knowledgeSources.length ? 'Ready to test' : 'Add knowledge first'}</div>
              </div>
              <div className="steps">
                <div className="step">1. Connect Shopify</div>
                <div className="step">2. Sync knowledge</div>
                <div className="step">3. Test replies</div>
                <div className="step">4. Ship the widget later</div>
              </div>
              <form onSubmit={handleAsk}>
                <label className="label" htmlFor="question" style={{ marginTop: '22px' }}>
                  <span>Customer question</span>
                  <span className="meta">{questionLength} characters</span>
                </label>
                <input id="question" className="input" type="text" placeholder="Example: A customer says their package arrived damaged. What should we tell them?" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={isAsking} />
                <div className="helper">Quick prompts for realistic merchant testing:</div>
                <div className="chips">
                  {quickQuestions.map((sample) => (
                    <button key={sample} type="button" className="chip" onClick={() => handleQuickQuestion(sample)} disabled={isAsking}>{sample}</button>
                  ))}
                </div>
                <div className="row">
                <button type="submit" className="primary" disabled={isAsking || !question.trim() || !knowledgeSources.length}>{isAsking ? 'Generating reply...' : 'Test support agent'}</button>
                  <button type="button" className="secondary" onClick={handleClearQuestion} disabled={isAsking || !question}>Clear question</button>
                </div>
              </form>
              {error ? <div className="msg error">{error}</div> : null}
              {!error && infoMessage ? <div className="msg info">{infoMessage}</div> : null}
              <div className="label" style={{ marginTop: '20px' }}>
                <span>Agent reply</span>
                <span className="meta">{isAsking ? 'Waiting for backend response' : 'Latest result'}</span>
              </div>
              <div className="reply">{reply}</div>
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Billing and plan</h2>
                  <div className="copy">Keep billing inside the app so merchants can activate the StoreReply plan without leaving the hosted product flow.</div>
                </div>
                <div className={`badge ${billing.enabled ? 'ready' : 'loading'}`}>
                  {billing.enabled ? 'Plan active' : 'Billing needed'}
                </div>
              </div>
              <div className="miniGrid">
                <div className="miniCard">
                  <div className="miniLabel">Current plan</div>
                  <div className="miniValue">{billing.planName}</div>
                  <div className="copy" style={{ marginTop: '8px' }}>
                    {billing.recurringPriceLabel} {billing.interval.toLowerCase().replaceAll('_', ' ')}
                  </div>
                </div>
                <div className="miniCard">
                  <div className="miniLabel">Plan status</div>
                  <div className="miniValue">{billing.enabled ? 'Active' : 'Inactive'}</div>
                  <div className="copy" style={{ marginTop: '8px' }}>
                    {billing.enabled
                      ? `Status: ${billing.status}${billing.currentPeriodEnd ? ` until ${formatTimestamp(billing.currentPeriodEnd)}` : ''}${billing.test ? ' · Test mode' : ''}`
                      : `Requires activation${billing.trialDays ? ` · ${billing.trialDays}-day trial` : ''}${billing.test ? ' · Test mode' : ''}`}
                  </div>
                </div>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="primary"
                  onClick={handleStartBilling}
                  disabled={!shopDomain.trim() || !shopifyStatus.connected || billing.enabled}
                >
                  {billing.enabled ? 'Plan active' : 'Activate paid plan'}
                </button>
              </div>
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Recent customer conversations</h2>
                  <div className="copy">Every saved support reply is tracked per store in your app data, so merchants can review what shoppers asked and how the assistant responded.</div>
                </div>
                <div className={`badge ${conversationLogs.length ? 'ready' : 'loading'}`}>{conversationLogs.length ? `${conversationLogs.length} logged` : 'No logs yet'}</div>
              </div>
              {conversationLogs.length ? (
                <div className="split" style={{ marginBottom: '16px' }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="Search questions or replies"
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                  />
                  <select
                    className="select"
                    value={historyFilter}
                    onChange={(event) => setHistoryFilter(event.target.value)}
                  >
                    <option value="all">All reviews</option>
                    <option value="unreviewed">Unreviewed</option>
                    <option value="trusted">Trusted</option>
                    <option value="needs_review">Needs review</option>
                  </select>
                </div>
              ) : null}
              {conversationLogs.length ? (
                <div className="logList">
                  {visibleConversationLogs.length ? visibleConversationLogs.map((entry) => (
                    <div key={entry.id} className="logCard">
                      <div className="logMeta">
                        <div className="logTag">{entry.channel === 'storefront_widget' ? 'Storefront widget' : 'Merchant test'}</div>
                        <div className="logTag">{formatTimestamp(entry.createdAt)}</div>
                        <div className="logTag">{entry.knowledgeSourceCount || 0} sources</div>
                      </div>
                      <div className="logQuestion">{entry.question}</div>
                      <div className="logReply">{entry.reply || 'No reply stored.'}</div>
                      <div className="logSupport" style={{ marginTop: '10px' }}>
                        <div className="logTag">{entry.grounding?.label || 'Unknown grounding'}</div>
                        <div className="logTag">{(entry.reviewStatus || 'unreviewed').replaceAll('_', ' ')}</div>
                        {Array.isArray(entry.usedSources) && entry.usedSources.length
                          ? entry.usedSources.map((source) => (
                              <div key={`${entry.id}-${source.id}`} className="logTag">
                                {source.label}: {source.name}
                              </div>
                            ))
                          : <div className="logTag">No source detail saved</div>}
                      </div>
                      <div className="row" style={{ marginTop: '12px' }}>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleReviewConversation(entry.id, 'trusted')}
                        >
                          Mark trusted
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleReviewConversation(entry.id, 'needs_review')}
                        >
                          Needs review
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleReviewConversation(entry.id, 'unreviewed')}
                        >
                          Clear review
                        </button>
                      </div>
                    </div>
                  )) : <div className="note">No conversations match the current review filters.</div>}
                </div>
              ) : (
                <div className="note">Once a merchant or storefront customer asks a question, the conversation log will appear here.</div>
              )}
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Usage tracking</h2>
                  <div className="copy">Track how often the support agent is used across merchant testing and the live storefront widget.</div>
                </div>
                <div className="badge ready">Usage summary</div>
              </div>
              <div className="overview" style={{ marginTop: 0 }}>
                <div className="metric card" style={{ padding: 0, boxShadow: 'none', background: 'transparent', border: 'none' }}>
                  <div className="metricLabel">Questions today</div>
                  <div className="metricValue">{usageStats.todayCount}</div>
                  <div className="metricCopy">Support questions logged across all channels today.</div>
                </div>
                <div className="metric card" style={{ padding: 0, boxShadow: 'none', background: 'transparent', border: 'none' }}>
                  <div className="metricLabel">Total questions</div>
                  <div className="metricValue">{usageStats.totalQuestions}</div>
                  <div className="metricCopy">All saved support questions for this store.</div>
                </div>
                <div className="metric card" style={{ padding: 0, boxShadow: 'none', background: 'transparent', border: 'none' }}>
                  <div className="metricLabel">Storefront widget</div>
                  <div className="metricValue">{usageStats.storefrontQuestions}</div>
                  <div className="metricCopy">Customer questions asked from the live storefront widget.</div>
                </div>
                <div className="metric card" style={{ padding: 0, boxShadow: 'none', background: 'transparent', border: 'none' }}>
                  <div className="metricLabel">Cache hits</div>
                  <div className="metricValue">{usageStats.cachedRepliesServed}</div>
                  <div className="metricCopy">Repeated questions answered from cache for faster response time.</div>
                </div>
              </div>
              <div className="note" style={{ marginTop: '12px' }}>
                Merchant test questions: {usageStats.merchantTestQuestions}. Last activity:{' '}
                {usageStats.lastAskedAt ? formatTimestamp(usageStats.lastAskedAt) : 'No activity yet'}.
              </div>
            </section>

            <section className="card">
              <div className="cardHead">
                <div>
                  <h2>Customer widget preview</h2>
                  <div className="copy">This is the next real product surface: a much simpler shopper-facing support UI powered by the same backend and merchant knowledge.</div>
                </div>
                <div className="badge ready">Next surface</div>
              </div>
              <div className="widgetWrap">
                <div className="widget" style={widgetAccentStyle}>
                  <div className="widgetHead">
                    <div className="widgetBrand">{merchantSettings.assistantName}</div>
                    <div className="widgetTag">Customer view</div>
                  </div>
                  <div className="thread">
                    <div className="bubble agent">{merchantSettings.welcomeMessage}</div>
                    <div className="bubble customer">{question.trim() || 'Can I return a damaged item?'}</div>
                    <div className="bubble agent">{merchantSettings.botEnabled ? widgetPreviewReply : 'Support is temporarily paused right now. Please contact the store directly if you need immediate help.'}</div>
                  </div>
                  <div className="widgetInput">{merchantSettings.placeholderText}</div>
                </div>
              </div>
              <div className="row" style={{ marginTop: '14px' }}>
                <button type="button" className="widgetLauncher" style={launcherStyle}>Open support chat</button>
              </div>
              <div className="note">Shoppers should not see the sync tools, source cards, or merchant testing controls. They only see the support conversation.</div>
            </section>
          </div>
        </div>
          </>
        )}
      </div>
    </>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
