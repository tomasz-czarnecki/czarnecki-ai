// Mr Whybox's brain: what the black box knows about Tomasz.
// The chat calls window.WHYBOX.answer(question, { topic, asked, history }) and expects
// a (promise of) { text, links?, next?, topic? }. To plug in a language model later,
// replace answer() with an API call and keep that return shape.
(() => {
const L = {
  email: { label: 'tomasz@czarnecki.ai', href: 'mailto:tomasz@czarnecki.ai' },
  linkedin: { label: 'LinkedIn ↗', href: 'https://www.linkedin.com/in/czarnecki-ai', ext: true },
  cv: { label: 'Download CV ↓', href: 'CV_TomaszCzarnecki_Latest.pdf', ext: true },
  yaga: { label: 'yagalabs.io ↗', href: 'https://yagalabs.io', ext: true },
  alloc: { label: 'Allocation AI case study ›', href: 'allocation-ai.html' },
  promo: { label: 'Promo Advisor case study ›', href: 'promo-advisor.html' },
  flight: { label: 'Smart Flighting case study ›', href: 'smart-flighting.html' },
  xinhee: { label: 'See the built building ↗', href: 'https://www.behance.net/gallery/173267555/Architectural-images-of-Xiamen-Xinhee-Design-Center', ext: true },
  video: { label: 'Watch the intro ›', href: '#highlights', close: true },
  news1: { label: 'Brewing with AI ↗', href: 'https://www.theheinekencompany.com/newsroom/brewing-with-ai/', ext: true },
  news2: { label: 'Innovative AI ↗', href: 'https://www.theheinekencompany.com/newsroom/innovative-ai-that-transforms-connections/', ext: true },
};

// keys: lowercase word starts ("archit" matches "architecture"); a trailing space means whole word only.
const T = [
  { id: 'about', q: 'Who is Tomasz?', w: 0.55,
    keys: ['who is', "who's", 'about him', 'about tomasz', 'tell me about', 'introduce', 'summar', 'background', 'bio ', 'tomasz', 'czarnecki', 'tldr', 'tl dr', 'elevator'],
    text: "Tomasz Czarnecki. AI product manager, architect by training. For five years he was the first product person at Heineken's Global Analytics & AI Hub: three production decision systems for a ~€2.9B marketing and sales budget. Now he runs Yaga Labs, his own studio. He also built me. Make of that what you will.",
    next: ['heineken', 'china', 'yaga'] },
  { id: 'heineken', q: 'What did he build at Heineken?',
    keys: ['heineken', 'hub ', 'beer', 'brew', 'analytics', 'what does he do', 'what did he do', 'job ', 'product manager', 'product person', 'ai product', 'decision system', 'built at', 'build at'],
    text: "Three decision systems that tell commercial teams where the money goes. Allocation AI: where to spend. Promo Advisor: what to promote. Smart Flighting: when to spend. Measured lift feeds next year's plan. He was the hub's first product person. It grew from ~10 people to more than 100.",
    links: ['alloc', 'promo', 'flight'], next: ['consult', 'alloc', 'trust'] },
  { id: 'alloc', q: 'What is Allocation AI?',
    keys: ['allocation', 'owl', 'marketing mix', 'mmm ', 'roi ', 'bayes', 'response curve'],
    text: "The owl. Bayesian budget allocation across markets, brands and channels: the next euro goes wherever the response curve says it pays back best. Heineken reports a 36% ROI improvement, with gross-profit lift in Mexico, Brazil and the Netherlands.",
    links: ['alloc'], next: ['promo', 'flight', 'budget'] },
  { id: 'promo', q: 'What is Promo Advisor?',
    keys: ['promo', 'fox', 'nine tail', 'revenue management', 'cannibal', 'discount', 'pricing'],
    text: "The nine-tailed fox. Nine tails, nine scenarios. Diagnostics, scenario simulation and calendar optimisation, so every promotion is tested before it launches. Shipped in 17 markets: 30–40% less planning time, ~15% less cannibalisation.",
    links: ['promo'], next: ['consult', 'flight'] },
  { id: 'flight', q: 'What is Smart Flighting?',
    keys: ['flighting', 'flight', 'lynx', 'timing', 'media', 'campaign', 'when to spend'],
    text: "The lynx. It waits, then pounces. It tests campaign timing against AI response curves, week by week, so media money lands when it actually converts. It retired an Excel process. Target: +1–1.5% net revenue.",
    links: ['flight'], next: ['alloc', 'trust'] },
  { id: 'consult', q: 'How did three people beat a consultancy?',
    keys: ['consult', 'build vs', 'build or buy', 'buy ', 'won ', 'win ', 'beat', 'three of', 'demo', 'mckinsey', 'bcg ', 'team of'],
    text: "Heineken was ready to buy a consultancy's promo-planning product. Three of them, a product owner, a data scientist and Tomasz, got less than half a year to prove in-house would work better. Month four: a wireframe Promo Advisor and a model running in the command line, on real data. Real data beat polish. The consultancy was off the project.",
    next: ['heineken', 'trust'] },
  { id: 'china', q: 'Five years in China?',
    keys: ['china', 'chinese', 'beijing', 'shenzhen', 'asia', 'mandarin', 'abroad', 'five years', 'decade', 'expat'],
    text: "Five years working in China, back and forth ever since. He was one of two founding members of MAD Architects' parametric design group in Beijing, then worked on projects in Harbin, Xiamen and Shenzhen. Scripts in, buildings out.",
    next: ['buildings', 'switch', 'firsts'] },
  { id: 'buildings', q: 'Which buildings did he work on?',
    keys: ['building', 'architect', 'mad ', 'arep', 'opera', 'harbin', 'gangxia', 'skylight', 'project', 'parametric', 'grasshopper', 'galapagos', 'design'],
    text: "At MAD Architects: the parametric timber interior of the Harbin Opera House (2015) and the double-curved membrane facade of the Xinhee Design Center in Xiamen (2015–16). At AREP: parametric skylights and entrances for the Gangxia North hub competition win in Shenzhen (2016–17).",
    links: ['xinhee'], next: ['xinhee', 'switch'] },
  { id: 'xinhee', q: 'Tell me about the Xinhee facade', w: 1.1,
    keys: ['xinhee', 'membrane', 'ptfe', 'facade', 'xiamen'],
    text: "Six office arms around a central atrium, wrapped in a floating PTFE skin. Tomasz built the parametric model that generated the double-curved membrane and made it buildable, optimising membrane cost and buildability at once. Optimal was easy. Buildable was the job.",
    links: ['xinhee'], next: ['switch', 'buildings'] },
  { id: 'switch', q: 'Why architecture → AI?',
    keys: ['switch', 'career', 'why ai', 'into ai', 'to ai', 'from archit', 'leave archit', 'left archit', 'pivot', 'transition', 'evolutionary', 'solver', 'genetic'],
    text: "He'd say it isn't a switch. A decade before \"AI agent\" was a phrase, he was building evolutionary solvers that bred building geometry from a fitness function. Buildings were programs. Every model, market and building gave a range, not an answer. His job is getting people to act on the range.",
    next: ['trust', 'heineken'] },
  { id: 'trust', q: 'Why black boxes you can argue with?',
    keys: ['trust', 'argue', 'black box', 'blackbox', 'philosoph', 'approach', 'believe', 'belief', 'probabilit', 'range ', 'defend', 'adoption', 'explain'],
    text: "Commercial teams don't need the right number. They need a call they can defend. So he gives models a face, a voice and a reason, until people trust them enough to argue back. A black box with a face is easier to argue with. I'm the demonstration. Go on, argue.",
    next: ['heineken', 'me'] },
  { id: 'firsts', q: 'First person in, three times?',
    keys: ['first', 'poland', 'polish', 'europe', 'founding', 'from zero'],
    text: "First hire at a Chinese architecture firm's European office, set up in Poland from zero. One of two founding members of MAD's parametric design group in Beijing. First product person at Heineken's Global Analytics & AI Hub. The fourth time, it's his own: Yaga Labs.",
    next: ['yaga', 'china'] },
  { id: 'yaga', q: "What's Yaga Labs?",
    keys: ['yaga', 'pani', 'witch', 'studio', 'own company', 'his company', 'startup', 'business', 'now ', 'doing now', 'latest'],
    text: "His studio: agents, small AI tools and black boxes you can argue with. Pani Yaga is its conscience. Three hundred years old, opinions about your model, usually right. I try not to make eye contact.",
    links: ['yaga'], next: ['agents', 'me'] },
  { id: 'agents', q: 'What tools has he built?',
    keys: ['agent', 'tool', 'side project', 'cli ', 'unicorn', 'lion', 'dragon', 'blender', 'mcp', 'content system', 'domain', 'automat'],
    text: "Four agents in daily use at Yaga Labs. The unicorn: a domain-discovery CLI that calls an LLM only when a name is worth judging. The lion: a content system that drafts and typesets his posts in one voice. The dragon: a Blender-MCP pipeline, prompt in, 3D scene out. The cat: this website.",
    links: ['yaga'], next: ['site', 'yaga'] },
  { id: 'site', q: 'Who built this website?',
    keys: ['website', 'site ', 'this page', 'built this', 'made this', 'claude code', 'three js', 'threejs', 'webgl', 'shader', 'fur ', 'code'],
    text: "Tomasz designed and built czarnecki.ai with Claude Code. Me included: a few dozen layers of shader fur and one bad attitude.",
    next: ['me', 'agents'] },
  { id: 'me', q: 'What are you?', w: 0.8,
    keys: ['you ', 'yourself', 'whybox', 'your name', 'who are you', 'what are you', 'monster', 'box '],
    text: "Mr Whybox. A black box with a face. Right now I only know what Tomasz has taught me: his work, his buildings, his years in China. A real language model is coming. Be nice to me before that happens.",
    next: ['about', 'trust'] },
  { id: 'companies', q: 'Who has he worked with?',
    keys: ['worked with', 'work with', 'client', 'companies', 'employer', 'macopedia', 'pearson', 'macmillan', 'raben', 'logos', 'where has he worked', 'where did he work', 'experience'],
    text: "Heineken, MAD Architects, AREP, Macopedia, Pearson, Macmillan Education and Raben. Beer, buildings, books and logistics.",
    next: ['heineken', 'buildings'] },
  { id: 'budget', q: 'How much does Heineken spend?',
    keys: ['spend', 'billion', 'million', '€', 'money', 'how much'],
    text: "About €2.9B a year on marketing and selling (FY2024). Roughly €7.9 million a day. Someone decides where every one of those euros goes. Before the hub, that was spreadsheets and gut feel.",
    next: ['alloc', 'heineken'] },
  { id: 'skills', q: 'What is he good at?',
    keys: ['skill', 'good at', 'strength', 'expert', 'stack', 'speciali', 'superpower', 'what can he', 'tech'],
    text: "Turning models into decisions people actually act on. Product for decision systems, Bayesian response curves, promo and media simulation, parametric and computational design, and agents built on LLMs. Also explaining all of that to people who didn't ask.",
    next: ['trust', 'agents'] },
  { id: 'video', q: 'Is there an intro video?',
    keys: ['video', 'intro', 'watch', 'youtube', 'see him', 'look like'],
    text: "Ninety seconds, in person, in the Highlights section. What he built at Heineken, what he learned about getting people to trust a model, and what he's building now. Shorter than this conversation.",
    links: ['video'], next: ['heineken'] },
  { id: 'press', q: 'Has Heineken written about it?',
    keys: ['press', 'newsroom', 'article', 'news', 'coverage', 'written', 'featured'],
    text: "Twice, in its own newsroom: Brewing with AI (2025) and Innovative AI (2026). I've read both. I'm not in either. Rude.",
    links: ['news1', 'news2'], next: ['heineken', 'alloc'] },
  { id: 'contact', q: 'How do I reach him?',
    keys: ['contact', 'reach', 'email', 'mail ', 'linkedin', 'talk to him', 'get in touch', 'message him', 'call ', 'meet', 'connect', 'phone'],
    text: "Email tomasz@czarnecki.ai or find him on LinkedIn. Tell him what your black box predicts and who ignores it. He'll tell you what he'd build first.",
    links: ['email', 'linkedin'], next: ['cv', 'yaga'] },
  { id: 'cv', q: 'Can I see his CV?',
    keys: ['cv ', 'resum', 'curriculum'],
    text: "Here. Short version: architect, then parametric design in China, then five years as the first product person at Heineken's AI hub, now Yaga Labs.",
    links: ['cv', 'linkedin'], next: ['contact', 'heineken'] },
  { id: 'hire', w: 1.1,
    keys: ['hire', 'hiring', 'availab', 'open to', 'looking for', 'job offer', 'recruit', 'role', 'position', 'freelance', 'consulting', 'salary', 'work with him', 'work together'],
    text: "A recruiter. I knew it. He's building Yaga Labs and likes one kind of problem: models that are right and still ignored. Best move: email him with what you've got.",
    links: ['email', 'linkedin', 'cv'], next: ['heineken', 'skills'] },
  { id: 'education',
    keys: ['study', 'studied', 'universit', 'education', 'degree', 'school', 'diploma', 'master', 'phd', 'graduat', 'trained', 'training'],
    text: "Architect by training. The diploma details are in his CV. He hasn't trusted me with them yet.",
    links: ['cv'], next: ['buildings', 'switch'] },
  { id: 'personal',
    keys: ['family', 'wife', 'husband', 'partner', 'kid', 'child', 'hobb', 'free time', 'weekend', 'married', 'girlfriend', 'age ', 'how old', 'born', 'live', 'from ', 'where is he', 'personal', 'life', 'fun ', 'sport', 'music', 'food', 'pet ', 'dog'],
    text: "Personal stuff? He hasn't fed me that yet. I know his work, his buildings and his years in China. For the rest, ask the human.",
    links: ['email'], next: ['about', 'china'] },
  { id: 'hello', w: 0.9,
    keys: ['hi ', 'hello', 'hey', 'hiya', 'yo ', 'sup ', 'good morning', 'good evening', 'good afternoon', 'howdy', 'ahoy', 'czesc'],
    text: ["Oh. Hi. Ask me about Tomasz: Heineken, China, buildings, Yaga Labs. I'll answer. Mostly.", 'Hello. Yes, I can talk now. Try not to make it weird.'] },
  { id: 'thanks', w: 0.9,
    keys: ['thank', 'thx', 'cheers', 'appreciate', 'nice one', 'cool', 'great', 'awesome'],
    text: ["You're welcome. I'll be at the bottom of the page, judging your scrolling.", 'Obviously. Anything else?'] },
  { id: 'bye', w: 0.9,
    keys: ['bye', 'goodbye', 'see you', 'later', 'ciao', 'cya'],
    text: ['Fine. Leave. Double-click me if you get lonely.'] },
  { id: 'rude', w: 0.8,
    keys: ['stupid', 'dumb', 'idiot', 'useless', 'hate', 'suck', 'ugly', 'shut up', 'annoying', 'creepy', 'weird'],
    text: ["Rude. Accurate, maybe, but rude. Ask me something about Tomasz and I'll redeem myself."] },
  { id: 'llm', w: 0.9,
    keys: ['chatgpt', 'gpt', 'claude ', 'llm ', 'language model', 'are you ai', 'are you real', 'robot', 'sentient', 'conscious', 'openai', 'anthropic', 'gemini'],
    text: "Right now I'm a lookup table with fur. A real language model is coming. Until then I only know Tomasz, and I know him well.",
    next: ['about', 'me'] },
  { id: 'joke', w: 0.8,
    keys: ['joke', 'funny', 'laugh', 'entertain'],
    text: "A model walks into a meeting. Everyone nods at the dashboard. Nobody changes a thing. That's not a joke. That's why Tomasz has a job.",
    next: ['trust'] },
];

const FALLBACK = [
  "That's not in my training data. My training data is mostly Tomasz. Try Heineken, China, buildings or Yaga Labs.",
  "Hm. No idea. He didn't teach me that one. Ask him directly: tomasz@czarnecki.ai",
  '#@%&! Wrong drawer. Ask me about his work, his buildings or his studio.',
];
const GREET_AGAIN = ['Back already? Ask away.', 'Oh. You again. Go on.', 'Hi again. I was just sitting here. Judging.'];
const START = ['about', 'heineken', 'china', 'yaga'];
const MORE = ['about', 'heineken', 'china', 'buildings', 'yaga', 'switch', 'agents', 'contact'];

const BY = {}; T.forEach((t) => { BY[t.id] = t; });
const norm = (s) => ' ' + String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/ś/g, 's').replace(/[^a-z0-9€→'\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const score = (t, n) => { let s = 0; for (const k of t.keys) if (n.includes(' ' + k)) s += 1 + k.trim().length / 8; return s * (t.w || 1); };
const pick = (v, i) => Array.isArray(v) ? v[i % v.length] : v;
const nextFor = (ids, asked) => {
  const out = [];
  for (const id of (ids || []).concat(MORE)) {
    if (out.length >= 3) break;
    if (BY[id] && BY[id].q && !asked.includes(id) && !out.includes(id)) out.push(id);
  }
  return out.map((id) => ({ id, q: BY[id].q }));
};
let fb = 0, rot = 0;

window.WHYBOX = {
  greet: (n) => n > 1 ? GREET_AGAIN[(n - 2) % GREET_AGAIN.length]
    : "You double-clicked me. Bold. I'm Mr Whybox, Tomasz's black box. Ask me anything about him: the work, the buildings, the years in China.",
  start: () => START.map((id) => ({ id, q: BY[id].q })),
  answer(question, o = {}) {
    const asked = o.asked || [];
    let t = o.topic && BY[o.topic];
    if (!t) {
      const n = norm(question); let bs = 0;
      for (const x of T) { const s = score(x, n); if (s > bs) { bs = s; t = x; } }
      if (bs < 1) t = null;
    }
    if (!t) return Promise.resolve({ text: FALLBACK[fb++ % FALLBACK.length], next: nextFor(['about', 'heineken', 'china'], asked) });
    return Promise.resolve({
      topic: t.id,
      text: pick(t.text, rot++),
      links: (t.links || []).map((k) => L[k]).filter(Boolean),
      next: t.next ? nextFor(t.next, asked.concat(t.id)) : null,
    });
  },
};
})();
