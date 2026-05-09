export type MemeCaseStudyKind = "success" | "control";

export type MemeOutcomeTier = "mega" | "large" | "mid" | "context" | "negative";

export type MemeCaseStudyStatus = "active" | "faded" | "volatile" | "negative" | "context";

export type MemeArchetype =
  | "ecosystem_community"
  | "absurd_mascot"
  | "animal_virality"
  | "visual_status"
  | "artist_archive"
  | "launch_drama"
  | "social_native"
  | "political_public_figure"
  | "nft_ip"
  | "celebrity_native"
  | "ai_agent"
  | "anti_utility_irony"
  | "launchpad_meta"
  | "community_takeover"
  | "exchange_reflexivity"
  | "cross_chain_context"
  | "negative_control";

export interface MemeCaseStudy {
  token: string;
  symbol: string;
  chain: string;
  launchpadOrSource: string;
  approximateLaunchDate: string;
  kind: MemeCaseStudyKind;
  peakOutcomeTier: MemeOutcomeTier;
  status: MemeCaseStudyStatus;
  memeticArchetypes: MemeArchetype[];
  catalysts: string[];
  riskLessons: string[];
  evidenceUrls: string[];
}

export const MEME_CASE_STUDIES: MemeCaseStudy[] = [
  caseStudy("Samoyedcoin", "SAMO", "Solana", "early Solana community", "2021-04", "large", "faded", ["ecosystem_community"], ["early Solana identity", "dog coin familiarity", "community onboarding"], ["older winners can fade after the ecosystem narrative rotates"], ["https://www.coingecko.com/en/coins/samoyedcoin", "https://www.samoyedcoin.com/"]),
  caseStudy("Bonk", "BONK", "Solana", "community airdrop", "2022-12", "mega", "active", ["ecosystem_community", "launchpad_meta", "exchange_reflexivity"], ["post-FTX Solana revival", "large community airdrop", "many ecosystem integrations"], ["ecosystem tokens can become large but are not comparable to tiny new launches"], ["https://www.coingecko.com/en/coins/bonk"]),
  caseStudy("Myro", "MYRO", "Solana", "Raydium", "2023-11", "large", "faded", ["ecosystem_community", "absurd_mascot", "animal_virality"], ["Solana founder dog association", "dog coin familiarity", "early Solana meme cycle"], ["founder-adjacent references can overheat and decay"], ["https://www.coingecko.com/en/coins/myro"]),
  caseStudy("Wen", "WEN", "Solana", "Jupiter LFG", "2024-01", "large", "faded", ["launchpad_meta", "ecosystem_community"], ["airdrop hunter catchphrase", "Jupiter launchpad test", "broad claim eligibility"], ["airdrop and burn news can become sell-the-news events"], ["https://www.coindesk.com/markets/2024/01/27/around-17-of-wen-token-supply-could-be-burned-after-airdrop-data-suggests"]),
  caseStudy("dogwifhat", "WIF", "Solana", "Raydium", "2023-11", "mega", "active", ["absurd_mascot", "visual_status", "exchange_reflexivity"], ["simple image", "misspelled phrase", "Crypto Twitter remixability", "major listings"], ["later copycats of a simple mascot rarely retain the original energy"], ["https://knowyourmeme.com/memes/subcultures/dogwifhat-meme-coin", "https://www.coindesk.com/markets/2024/03/06/solana-meme-coin-dogwifhat-surges-48-outperforming-bonk-doge"]),
  caseStudy("Popcat", "POPCAT", "Solana", "community takeover", "2023-12", "mega", "faded", ["animal_virality", "absurd_mascot", "community_takeover"], ["pre-existing internet meme", "cat-season narrative", "community takeover"], ["community takeover can help, but only when the underlying meme is already recognizable"], ["https://www.coindesk.com/markets/2024/07/22/popcat-crosses-1b-mog-rallies-as-solana-ethereum-beta-bets-gain-favor", "https://www.coingecko.com/en/coins/popcat"]),
  caseStudy("cat in a dogs world", "MEW", "Solana", "Raydium", "2024-03", "large", "faded", ["animal_virality", "visual_status"], ["cat counter-positioning against dog coins", "story-world branding", "targeted airdrops"], ["clever positioning matters less once the broader cat narrative cools"], ["https://coinmarketcap.com/currencies/mew", "https://www.coingecko.com/en/coins/mew"]),
  caseStudy("Ponke", "PONKE", "Solana", "Raydium", "2023-12", "large", "faded", ["absurd_mascot", "visual_status"], ["degen monkey character", "rough anti-corporate art style", "social pressure for listings"], ["character tokens need continuous meme output"], ["https://learn.bybit.com/en/memes/what-is-ponke-crypto"]),
  caseStudy("Michi", "MICHI", "Solana", "Raydium", "2024-04", "large", "faded", ["animal_virality", "absurd_mascot"], ["internet cat recognition", "cat-cycle liquidity", "simple ticker"], ["cat tokens are especially crowded after the initial winner emerges"], ["https://www.coingecko.com/en/coins/michicoin"]),
  caseStudy("Billy", "BILLY", "Solana", "Pump.fun", "2024-06", "large", "faded", ["animal_virality", "community_takeover", "launchpad_meta"], ["dog image", "developer sold early", "community takeover", "Pump.fun first major winner narrative"], ["developer abandonment can be reframed only if community momentum is obvious"], ["https://coinmarketcap.com/academy/article/solana-memecoin-billy-surges-past-dollar100m-market-cap-becomes-second-largest-pumpfun-token", "https://knowyourmeme.com/memes/sites/pumpfun"]),
  caseStudy("Fwog", "FWOG", "Solana", "Pump.fun", "2024-07", "large", "faded", ["absurd_mascot", "community_takeover", "launchpad_meta"], ["deliberate misspelling", "frog familiarity", "minimalist absurdity"], ["simple animal variants need proof of fresh culture, not just a cute image"], ["https://www.coingecko.com/en/coins/fwog", "https://coinmarketcap.com/currencies/fwog-solana/"]),
  caseStudy("Moo Deng", "MOODENG", "Solana", "Pump.fun", "2024-09", "large", "faded", ["animal_virality", "social_native"], ["globally viral baby hippo", "mainstream media coverage", "brand accounts posting memes"], ["viral animal topics spawn many duplicate contracts"], ["https://www.coingecko.com/learn/what-is-moodeng-crypto-hippo-memecoin-solana"]),
  caseStudy("Peanut the Squirrel", "PNUT", "Solana", "Pump.fun", "2024-11", "large", "faded", ["animal_virality", "political_public_figure"], ["emotional news cycle", "public outrage", "major exchange attention"], ["outrage topics are volatile and ethically risky"], ["https://coinmarketcap.com/academy/article/peanut-the-squirrel-meme-coin-surges-20percent-after-coinbase-listing-reaches-dollar134-billion-market-cap"]),
  caseStudy("Gigachad", "GIGA", "Solana", "Raydium", "2024-01", "large", "faded", ["visual_status", "cross_chain_context"], ["existing status meme", "self-improvement language", "large recognizable image bank"], ["status memes can be durable but may be slow-moving versus breaking news"], ["https://www.coingecko.com/en/coins/gigachad-2"]),
  caseStudy("Mumu the Bull", "MUMU", "Solana", "Raydium", "2024-01", "large", "faded", ["visual_status", "ecosystem_community"], ["bull-market mascot", "crypto-native visual language", "market-cycle fit"], ["market-cycle mascots depend heavily on risk-on liquidity"], ["https://coinmarketcap.com/currencies/mumu-ing/"]),
  caseStudy("TROLL", "TROLL", "Solana", "PumpSwap", "2025-04", "mid", "volatile", ["visual_status", "anti_utility_irony"], ["internet trolling identity", "simple ticker", "social media engagement"], ["broad internet concepts can be too generic without a current catalyst"], ["https://www.coingecko.com/en/coins/troll-2"]),
  caseStudy("Smoking Chicken Fish", "SCF", "Solana", "Pump.fun", "2024-09", "mid", "faded", ["absurd_mascot", "anti_utility_irony"], ["weird visual phrase", "cult-like in-joke", "absurd religious framing"], ["high absurdity is not enough without liquidity and continuing attention"], ["https://www.coingecko.com/en/coins/smoking-chicken-fish", "https://coinmarketcap.com/currencies/smoking-chicken-fish/"]),
  caseStudy("Retardio", "RETARDIO", "Solana", "Raydium", "2024-05", "large", "faded", ["visual_status", "community_takeover"], ["Solana in-group humor", "strong community identity", "high-volatility attention"], ["edgy language increases moderation, reputational, and audience risks"], ["https://coinmarketcap.com/currencies/retardio"]),
  caseStudy("Book of Meme", "BOME", "Solana", "presale/Raydium", "2024-03", "mega", "faded", ["artist_archive", "launchpad_meta", "exchange_reflexivity"], ["Darkfarms artist credibility", "meme archive concept", "rapid Binance attention"], ["presale mania and exchange reflexivity can reverse fast"], ["https://www.coingecko.com/en/coins/book-of-meme", "https://learn.bybit.com/en/memes/what-is-book-of-meme-bome"]),
  caseStudy("Slerf", "SLERF", "Solana", "presale/Raydium", "2024-03", "large", "faded", ["launch_drama", "animal_virality"], ["developer burn mistake", "sympathy and spectacle", "massive first-day volume"], ["launch drama is not repeatable and may be manipulation"], ["https://www.coindesk.com/markets/2024/03/18/solana-meme-slerf-notches-17b-in-volume-after-developer-loses-all-presale-funds"]),
  caseStudy("Just a chill guy", "CHILLGUY", "Solana", "Pump.fun", "2024-10", "large", "faded", ["social_native", "visual_status"], ["TikTok-native character", "phrase fit", "Gen Z remixability"], ["IP ownership and meme exhaustion can arrive quickly"], ["https://www.kucoin.com/news/articles/all-about-chillguy-the-viral-tiktok-memecoin-surging-over-6-000-to-a-700m-market-cap", "https://knowyourmeme.com/memes/sites/pumpfun"]),
  caseStudy("Official Trump", "TRUMP", "Solana", "official launch", "2025-01", "mega", "volatile", ["political_public_figure", "exchange_reflexivity"], ["official public figure launch", "inauguration timing", "global media attention"], ["insider allocation and follow-on launches can hurt retail confidence"], ["https://www.coingecko.com/learn/what-is-trump-memecoin-crypto"]),
  caseStudy("Melania Meme", "MELANIA", "Solana", "official launch", "2025-01", "large", "negative", ["political_public_figure", "celebrity_native"], ["follow-on public figure launch", "proximity to TRUMP mania"], ["follow-on launches can be interpreted as extraction and damage the whole meta"], ["https://www.coingecko.com/learn/what-is-trump-memecoin-crypto"]),
  caseStudy("Jeo Boden", "BODEN", "Solana", "Raydium", "2024-03", "large", "faded", ["political_public_figure", "social_native"], ["PolitiFi misspelling", "election-year jokes", "simple parody identity"], ["political parody coins decay when election attention moves"], ["https://www.coingecko.com/en/categories/politifi"]),
  caseStudy("Doland Tremp", "TREMP", "Solana", "Raydium", "2024-03", "mid", "faded", ["political_public_figure", "social_native"], ["PolitiFi misspelling", "election-year attention", "rivalry with BODEN"], ["copycat political misspellings need clear timing to matter"], ["https://www.coingecko.com/en/categories/politifi"]),
  caseStudy("Pudgy Penguins", "PENGU", "Solana", "NFT/IP airdrop", "2024-12", "mega", "active", ["nft_ip", "ecosystem_community", "exchange_reflexivity"], ["large NFT brand", "consumer IP recognition", "Solana airdrop expansion"], ["IP tokens can launch large but are not comparable to anonymous tiny launches"], ["https://www.coingecko.com/learn/what-is-pengu-pudgy-penguins-token", "https://www.coindesk.com/business/2024/12/17/pudgy-penguins-pengu-token-debuts-at-312-m-market-cap"]),
  caseStudy("Mother Iggy", "MOTHER", "Solana", "Pump.fun", "2024-05", "large", "faded", ["celebrity_native", "social_native"], ["celebrity account promotion", "raunchy meme fit", "direct social engagement"], ["celebrity tokens often become extraction events without sustained effort"], ["https://www.coindesk.com/business/2024/06/06/iggy-azaleas-mother-meme-coin-turned-3k-into-9m-for-one-lucky-crypto-trader", "https://www.coingecko.com/learn/what-are-celebrity-tokens-crypto"]),
  caseStudy("Goatseus Maximus", "GOAT", "Solana", "Pump.fun", "2024-10", "large", "faded", ["ai_agent", "anti_utility_irony"], ["Truth Terminal narrative", "AI agent novelty", "weird internet lore"], ["AI memes rot quickly when newer agents appear"], ["https://knowyourmeme.com/memes/subcultures/goatseus-maximus-goat"]),
  caseStudy("Fartcoin", "FARTCOIN", "Solana", "Pump.fun", "2024-10", "mega", "active", ["ai_agent", "anti_utility_irony"], ["Truth Terminal adjacency", "absurd universally legible joke", "anti-serious positioning"], ["copycat fart tokens are usually late unless tied to a fresh narrative"], ["https://www.coingecko.com/learn/what-is-fartcoin-ai-memecoin-crypto"]),
  caseStudy("Zerebro", "ZEREBRO", "Solana", "Raydium", "2024-10", "large", "active", ["ai_agent", "social_native"], ["autonomous AI content", "hyperstition narrative", "multi-platform posting"], ["technical-sounding AI narratives can mask weak token demand"], ["https://www.coingecko.com/en/coins/zerebro"]),
  caseStudy("Act I The AI Prophecy", "ACT", "Solana", "Pump.fun", "2024-10", "large", "faded", ["ai_agent", "exchange_reflexivity"], ["AI chatbot Discord narrative", "Binance listing shock", "thin liquidity"], ["CEX listing pumps can be reflexive and extremely volatile"], ["https://www.coindesk.com/business/2024/11/11/solana-memecoin-act-rockets-1720-on-binance-listing-as-altcoin-market-heats-up", "https://coinmarketcap.com/currencies/act-i-the-ai-prophecy"]),
  caseStudy("ai16z", "AI16Z", "Solana", "Raydium", "2024-10", "large", "faded", ["ai_agent", "visual_status"], ["AI venture DAO parody", "Marc Andreessen reference", "agent-investor narrative"], ["rebrands and migrations can break continuity for holders"], ["https://www.coingecko.com/en/coins/ai16z"]),
  caseStudy("Pippin", "PIPPIN", "Solana", "Raydium", "2025-01", "mid", "volatile", ["ai_agent", "absurd_mascot"], ["AI mascot narrative", "agent-token meta", "short ticker"], ["agent mascots need demonstrable social activity"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  caseStudy("Useless Coin", "USELESS", "Solana", "LetsBONK", "2025-05", "large", "active", ["anti_utility_irony", "launchpad_meta"], ["literal uselessness", "ironic anti-pitch", "LetsBONK launchpad attention"], ["anti-utility only works when the joke is explicit and community-owned"], ["https://www.coindesk.com/markets/2025/06/18/token-that-s-literally-useless-is-crypto-s-latest-meme-cult", "https://coinmarketcap.com/currencies/useless-3/"]),
  caseStudy("Launch Coin on Believe", "LAUNCHCOIN", "Solana", "Believe.app", "2025-01", "large", "faded", ["launchpad_meta", "social_native"], ["X-reply token launch meta", "creator-token narrative", "platform speculation"], ["platform-token narratives can collapse if usage does not persist"], ["https://www.coingecko.com/learn/what-is-believe-token-launchpad", "https://www.coindesk.com/price/launchcoin"]),
  caseStudy("Maneki", "MANEKI", "Solana", "Raydium", "2024-04", "large", "faded", ["absurd_mascot", "animal_virality"], ["lucky cat imagery", "Asian market symbolism", "short memorable ticker"], ["symbolic mascots need active culture beyond logo familiarity"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  caseStudy("Harambe on Solana", "HARAMBE", "Solana", "Raydium", "2024-03", "mid", "faded", ["animal_virality", "cross_chain_context"], ["legacy internet animal meme", "recognizable tragedy-adjacent meme", "Solana meme rotation"], ["old memes are often saturated and ethically sensitive"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  caseStudy("Sigma", "SIGMA", "Solana", "Raydium", "2024-09", "mid", "volatile", ["visual_status", "social_native"], ["sigma male meme language", "short status word", "TikTok vocabulary"], ["generic status words need current evidence of acceleration"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  caseStudy("Aura", "AURA", "Solana", "Pump.fun", "2024-06", "mid", "faded", ["social_native", "visual_status"], ["TikTok aura points phrase", "single-word ticker", "youth slang"], ["slang tokens die when the phrase leaves the feed"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  caseStudy("Lock In", "LOCKIN", "Solana", "Pump.fun", "2024-06", "mid", "faded", ["social_native", "visual_status"], ["motivational internet phrase", "short command", "degen alignment"], ["common phrases require proof of a fresh meme spike"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  caseStudy("Luce", "LUCE", "Solana", "Pump.fun", "2024-10", "large", "faded", ["visual_status", "social_native"], ["Vatican anime mascot discourse", "unexpected institution plus cute character", "global novelty"], ["novel mascot topics attract fast copycats and IP risk"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  caseStudy("Vine Coin", "VINE", "Solana", "Pump.fun", "2025-01", "mid", "faded", ["social_native", "celebrity_native"], ["Vine nostalgia", "short ticker", "creator/social-platform association"], ["nostalgia needs a current catalyst, not just recognition"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  caseStudy("Pump.fun", "PUMP", "Solana", "Pump.fun", "2025-09", "large", "active", ["launchpad_meta", "ecosystem_community"], ["launchpad brand", "fee-machine narrative", "memecoin infrastructure exposure"], ["infrastructure tokens should not be confused with low-cap meme launches"], ["https://www.coingecko.com/en/coins/pump-fun"]),

  control("Dogecoin", "DOGE", "Dogecoin", "legacy chain", "2013-12", ["cross_chain_context"], ["proof that simple meme identity can persist for years"], ["not a new Solana launch and should not bias buys toward old dog clones"], ["https://www.coingecko.com/en/categories/meme-token"]),
  control("Shiba Inu", "SHIB", "Ethereum", "Ethereum", "2020-08", ["cross_chain_context"], ["dog-coin community scale and exchange reflexivity"], ["Ethereum-era supply mechanics do not map cleanly to Pump.fun launches"], ["https://www.coingecko.com/en/categories/meme-token"]),
  control("Pepe", "PEPE", "Ethereum", "Ethereum", "2023-04", ["cross_chain_context"], ["pre-existing internet character and massive liquidity"], ["most Pepe variants are stale clones"], ["https://www.coingecko.com/en/categories/meme-token"]),
  control("Mog Coin", "MOG", "Ethereum", "Ethereum", "2023-07", ["cross_chain_context", "visual_status"], ["Joycat and winning/status language"], ["non-Solana context only; do not boost unrelated cat copies"], ["https://www.coingecko.com/learn/types-of-meme-coins-crypto"]),
  control("Brett", "BRETT", "Base", "Base", "2024-02", ["cross_chain_context"], ["chain mascot positioning for Base"], ["chain mascot success does not imply Solana copycat demand"], ["https://www.coingecko.com/en/categories/meme-token"]),
  control("Libra", "LIBRA", "Solana", "custom", "2025-02", ["political_public_figure", "negative_control"], ["public figure mention created huge attention"], ["insider and fraud allegations make this a reject pattern, not a positive"], ["https://www.axios.com/2025/02/18/argentina-libra-meme-coin-trump"]),
  control("Celebrity copycat wave", "CELEB", "Solana", "Pump.fun", "2024-06", ["celebrity_native", "negative_control"], ["celebrity attention can move markets"], ["most celebrity tokens are extractive and short-lived without direct sustained participation"], ["https://www.coingecko.com/learn/what-are-celebrity-tokens-crypto"]),
  control("Generic AI Agent", "AGENT", "Solana", "Pump.fun", "2024-11", ["ai_agent", "negative_control"], ["AI agent meta attracted capital"], ["generic AI names without a real posting agent or story should fail the trend gate"], ["https://www.coingecko.com/learn/what-is-fartcoin-ai-memecoin-crypto"]),
  control("Baby Dog Clone", "BABYDOG", "Solana", "Pump.fun", "2024-01", ["animal_virality", "negative_control"], ["dog tokens are familiar"], ["generic baby/dog names are saturated and should be penalized"], ["https://www.coingecko.com/learn/types-of-meme-coins-crypto"]),
  control("Price Prediction Coin", "MOON100X", "Solana", "Pump.fun", "2024-01", ["negative_control"], ["degen language may get clicks"], ["promotional price-prediction wording is spam, not a meme thesis"], ["https://www.coingecko.com/en/categories/solana-meme-coins"]),
  control("Tragedy Memorial Token", "RIP", "Solana", "Pump.fun", "2024-01", ["negative_control"], ["real-world events produce token launches"], ["exploiting death or tragedy should be rejected"], ["https://www.coingecko.com/learn/what-is-moodeng-crypto-hippo-memecoin-solana"]),
  control("Forced Political Acronym", "VOTEAI", "Solana", "Pump.fun", "2024-10", ["political_public_figure", "negative_control"], ["election news gets attention"], ["forced acronyms without organic meme language should be rejected"], ["https://www.coingecko.com/en/categories/politifi"]),
  control("Stale TikTok Catchphrase", "OLDPHRASE", "Solana", "Pump.fun", "2024-10", ["social_native", "negative_control"], ["TikTok phrases can launch well"], ["phrases need current acceleration, not old familiarity"], ["https://www.kucoin.com/news/articles/all-about-chillguy-the-viral-tiktok-memecoin-surging-over-6-000-to-a-700m-market-cap"]),
  control("Fake Burn Drama", "BURNED", "Solana", "Pump.fun", "2024-03", ["launch_drama", "negative_control"], ["SLERF made burn drama famous"], ["manufactured burn drama should be treated as high risk"], ["https://www.coindesk.com/markets/2024/03/18/solana-meme-slerf-notches-17b-in-volume-after-developer-loses-all-presale-funds"]),
  control("Over-saturated Animal Derivative", "BABYHIPPOCAT", "Solana", "Pump.fun", "2024-09", ["animal_virality", "negative_control"], ["viral animal stories generate token swarms"], ["derivatives without first-source evidence should fail"], ["https://www.coingecko.com/learn/what-is-moodeng-crypto-hippo-memecoin-solana"])
];

export function successfulSolanaCaseStudies(): MemeCaseStudy[] {
  return MEME_CASE_STUDIES.filter((item) => item.kind === "success" && item.chain === "Solana");
}

export function controlCaseStudies(): MemeCaseStudy[] {
  return MEME_CASE_STUDIES.filter((item) => item.kind === "control");
}

export function buildCaseStudyPromptSummary(maxChars = 8000): string {
  const successLines = archetypeSummaryLines(successfulSolanaCaseStudies());
  const controlLines = archetypeSummaryLines(controlCaseStudies());
  const header =
    "Historical Solana memecoin pattern library. Learn archetypes, not ticker allowlists. Winners can be faded today but still teach launch-pattern recognition.";
  const body = [
    header,
    "Positive archetypes:",
    ...successLines,
    "Negative and context controls:",
    ...controlLines,
    "Apply lessons: reward fresh evidence, tickerability, remixable imagery, emotional or absurd social energy, and Solana launch plausibility. Penalize stale clones, tragedy exploitation, generic news, forced acronyms, insider-heavy launches, and copycats without fresh source-backed acceleration."
  ].join("\n");
  return body.length <= maxChars ? body : `${body.slice(0, maxChars - 180)}\n[summary truncated for cost control; keep applying archetypes, not token allowlists]`;
}

function archetypeSummaryLines(items: MemeCaseStudy[]): string[] {
  const byArchetype = new Map<MemeArchetype, MemeCaseStudy[]>();
  for (const item of items) {
    const primary = item.memeticArchetypes[0] ?? "negative_control";
    byArchetype.set(primary, [...(byArchetype.get(primary) ?? []), item]);
  }
  return [...byArchetype.entries()].map(([archetype, studies]) => {
    const examples = studies
      .slice(0, 10)
      .map((item) => `${item.symbol}:${item.catalysts.slice(0, 2).join("/")}`)
      .join("; ");
    const risks = [...new Set(studies.flatMap((item) => item.riskLessons.slice(0, 1)))].slice(0, 3).join(" ");
    return `- ${archetype}: ${examples}. Risk: ${risks}`;
  });
}

function caseStudy(
  token: string,
  symbol: string,
  chain: string,
  launchpadOrSource: string,
  approximateLaunchDate: string,
  peakOutcomeTier: Exclude<MemeOutcomeTier, "context" | "negative">,
  status: Exclude<MemeCaseStudyStatus, "context" | "negative"> | "negative",
  memeticArchetypes: MemeArchetype[],
  catalysts: string[],
  riskLessons: string[],
  evidenceUrls: string[]
): MemeCaseStudy {
  return {
    token,
    symbol,
    chain,
    launchpadOrSource,
    approximateLaunchDate,
    kind: "success",
    peakOutcomeTier,
    status,
    memeticArchetypes,
    catalysts,
    riskLessons,
    evidenceUrls
  };
}

function control(
  token: string,
  symbol: string,
  chain: string,
  launchpadOrSource: string,
  approximateLaunchDate: string,
  memeticArchetypes: MemeArchetype[],
  catalysts: string[],
  riskLessons: string[],
  evidenceUrls: string[]
): MemeCaseStudy {
  return {
    token,
    symbol,
    chain,
    launchpadOrSource,
    approximateLaunchDate,
    kind: "control",
    peakOutcomeTier: chain === "Solana" ? "negative" : "context",
    status: chain === "Solana" ? "negative" : "context",
    memeticArchetypes,
    catalysts,
    riskLessons,
    evidenceUrls
  };
}
