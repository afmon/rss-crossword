const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Simple concurrency limiter (p-limit alternative for CommonJS)
function createLimit(concurrency) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active < concurrency && queue.length > 0) {
      active++;
      const { fn, resolve, reject } = queue.shift();
      fn().then(resolve).catch(reject).finally(() => {
        active--;
        next();
      });
    }
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

// Limit concurrent Claude CLI calls to 2
const limit = createLimit(2);

const TIMEOUT_MS = 120000; // 120 seconds

/**
 * Call Claude CLI with a prompt
 * @param {string} prompt - The prompt to send
 * @param {string} label - Label for logging
 * @returns {Promise<string>} - Raw response
 */
async function callClaude(prompt, label = 'Claude') {
  return limit(async () => {
    const tempFile = path.join(os.tmpdir(), `crossword-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, prompt, 'utf8');

    console.log(`  [${label}] Calling Claude CLI...`);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { fs.unlinkSync(tempFile); } catch (e) {}
        reject(new Error(`${label} timeout`));
      }, TIMEOUT_MS);

      try {
        const command = `type "${tempFile}" | claude -p --model haiku --permission-mode default --output-format text`;

        const stdout = execSync(command, {
          encoding: 'utf8',
          timeout: TIMEOUT_MS,
          shell: true,
          maxBuffer: 10 * 1024 * 1024
        });

        clearTimeout(timeout);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  [${label}] Response received (${elapsed}s)`);

        try { fs.unlinkSync(tempFile); } catch (e) {}
        resolve(stdout);
      } catch (error) {
        clearTimeout(timeout);
        try { fs.unlinkSync(tempFile); } catch (e) {}
        console.error(`  [${label}] Error:`, error.message);
        reject(new Error(`${label} failed: ` + error.message));
      }
    });
  });
}

/**
 * Extract JSON from Claude response
 * @param {string} response - Claude response
 * @param {string} key - Expected key in JSON (e.g., "keywords" or "words")
 * @returns {object}
 */
function extractJson(response, key) {
  const pattern = new RegExp(`\\{[\\s\\S]*"${key}"[\\s\\S]*\\}`);
  const match = response.match(pattern);
  if (!match) {
    console.error('Claude response:', response.substring(0, 500));
    throw new Error(`No JSON with "${key}" found in response`);
  }
  return JSON.parse(match[0]);
}

/**
 * Stage 0: Filter similar news headlines
 * @param {Array<{title: string}>} newsItems - News headlines
 * @returns {Promise<Array<{title: string}>>} - Deduplicated news items
 */
async function filterSimilarNews(newsItems) {
  // First, remove exact duplicates (same title)
  const seen = new Set();
  const uniqueItems = [];
  for (const item of newsItems) {
    if (!seen.has(item.title)) {
      seen.add(item.title);
      uniqueItems.push(item);
    }
  }
  console.log(`  [Filter] Exact duplicates removed: ${newsItems.length} → ${uniqueItems.length}`);

  // If already small enough, skip Claude filtering
  if (uniqueItems.length <= 15) {
    console.log(`  [Filter] Skipping Claude filter (already ${uniqueItems.length} items)`);
    return uniqueItems;
  }

  const headlines = uniqueItems.map((item, i) => `${i + 1}. ${item.title}`).join('\n');

  const prompt = `【重要】計画や説明は不要です。JSON形式のみを出力してください。

以下のニュース見出しリストから、似たような内容の記事をグループ化し、各グループから代表的な1つだけを選んでください。

【ニュース見出しリスト】
${headlines}

【タスク】
1. 同じ出来事・トピックを扱っている見出しをグループ化
2. 各グループから最も情報量が多い見出しを1つ選ぶ
3. 重複のない見出しはそのまま採用

【出力形式】
選んだ見出しの番号をJSON配列で出力:
{"selected":[1,3,5,8,12]}

※番号のみを出力。説明は不要。`;

  console.log(`  [Filter] Checking ${uniqueItems.length} headlines for similar content...`);
  const response = await callClaude(prompt, 'Filter');
  const result = extractJson(response, 'selected');
  const selectedIndices = result.selected || [];

  // Map indices back to uniqueItems (indices are 1-based)
  const filtered = selectedIndices
    .map(i => uniqueItems[i - 1])
    .filter(item => item !== undefined);

  console.log(`  [Filter] Similar content filtered: ${uniqueItems.length} → ${filtered.length}`);

  return filtered;
}

/**
 * Stage 1: Extract keywords from news articles
 * @param {Array<{title: string, link?: string, content?: string}>} newsItems - News items with optional content
 * @param {number} count - Number of keywords to extract
 * @returns {Promise<Array<{word: string, reading: string, type: string, newsContext: string, articleIndex: number}>>}
 */
async function extractKeywords(newsItems, count = 30) {
  // Build article text with index, title and content
  const limitedItems = newsItems.slice(0, 20);
  const articles = limitedItems.map((item, index) => {
    if (item.content && item.content.length > 0) {
      return `[記事${index + 1}]【${item.title}】\n${item.content}`;
    }
    return `[記事${index + 1}]【${item.title}】`;
  }).join('\n\n');

  const prompt = `【重要】計画や説明は不要です。JSON形式のみを出力してください。

あなたはクロスワードパズルのキーワード選定者です。以下のニュース記事から、クロスワードパズルに適したキーワードを抽出してください。

ニュース記事:
${articles}

【抽出条件】
1. ${count}個のキーワードを抽出
2. 文字数のバリエーション:
   - 2〜3文字: ${Math.ceil(count * 0.35)}個（交差しやすい短い単語を多めに）
   - 4〜5文字: ${Math.ceil(count * 0.4)}個
   - 6〜8文字: ${Math.floor(count * 0.25)}個
3. 種類を多様に（各カテゴリから満遍なく）:
   - person: 人名（政治家、芸能人、スポーツ選手、経営者など）
   - place: 地名・国名・都市名
   - org: 組織名・企業名・チーム名
   - brand: ブランド名・商品名・サービス名（iPhone、ユニクロ、Netflix等）
   - culture: 映画・アニメ・ゲーム・音楽作品のタイトルやキャラクター
   - tech: IT・科学技術用語（AI、メタバース、量子等）
   - trend: 流行語・ネットスラング・新語
   - event: 出来事・イベント・大会名
   - term: 一般用語・専門用語・業界用語

【重要】多様性を重視してください:
- 同じカテゴリに偏らないこと
- ニュースに直接書かれていなくても、関連する有名な固有名詞を含めてOK
- 一般的に知られているブランド名や作品名も積極的に抽出
- 略称・愛称・通称も積極的に含める（チャッピー、ガンダム、ポケモン、スタバ、マック等）
- 人名の愛称やニックネームもOK（キムタク、マツジュン等）

【出力形式】
必ず以下のJSON形式のみを出力:
{"keywords":[{"word":"元の単語","reading":"カタカナ読み","type":"種類","newsContext":"どんなニュースで登場したか簡潔に","articleIndex":記事番号}]}

例:
{"keywords":[
  {"word":"ウクライナ","reading":"ウクライナ","type":"place","newsContext":"国際情勢で注目","articleIndex":1},
  {"word":"iPhone","reading":"アイフォン","type":"brand","newsContext":"Apple新製品","articleIndex":2},
  {"word":"鬼滅の刃","reading":"キメツノヤイバ","type":"culture","newsContext":"アニメ映画興行","articleIndex":3},
  {"word":"ChatGPT","reading":"チャットジーピーティー","type":"tech","newsContext":"AI技術の話題","articleIndex":4},
  {"word":"インフレ","reading":"インフレ","type":"term","newsContext":"経済ニュース","articleIndex":5}
]}`;

  console.log(`  [Keywords] Requesting ${count} keywords...`);
  const response = await callClaude(prompt, 'Keywords');
  const result = extractJson(response, 'keywords');
  const keywords = result.keywords || [];

  // Map article links to keywords
  const keywordsWithLinks = keywords.map(k => {
    const idx = (k.articleIndex || 1) - 1; // Convert 1-based to 0-based
    const article = limitedItems[idx] || limitedItems[0];
    return {
      ...k,
      articleLink: article?.link || null,
      articleTitle: article?.title || null
    };
  });

  console.log(`  [Keywords] Extracted ${keywordsWithLinks.length} keywords`);
  keywordsWithLinks.slice(0, 5).forEach(k => {
    console.log(`    - ${k.reading} (${k.type}): ${k.newsContext}`);
  });

  return keywordsWithLinks;
}

/**
 * Stage 2: Generate clues for keywords
 * @param {Array<{word: string, reading: string, type: string, newsContext: string, articleLink?: string}>} keywords
 * @returns {Promise<Array<{answer: string, clue: string, articleLink?: string}>>}
 */
async function generateClues(keywords) {
  const keywordList = keywords.map(k =>
    `- ${k.reading} (${k.type}): ${k.newsContext}`
  ).join('\n');

  const prompt = `【重要】計画や説明は不要です。JSON形式のみを出力してください。

あなたはクロスワードパズルのヒント作成者です。以下のキーワードに対して、「時事ネタまたは一般知識」で解けるヒント文を作成してください。

【キーワードリスト】
${keywordList}

【ヒント作成ルール】
1. ヒント文は20〜40文字程度で、情報量を多くする
2. あなたの一般知識を活用して、詳しく説明する
3. 2つのルートで解答可能にする:
   - 時事ネタルート: ニュースを追っている人が解ける
   - 一般知識ルート: ニュースを知らなくても解ける

【単語タイプ別の戦略】
- person（人名）: 国籍、職業、代表作、所属、経歴などを含める
- place（地名）: 地理的位置、首都、人口規模、有名な特徴を含める
- org（組織）: 業種、設立年や本社所在地、代表的な製品やサービス
- event（出来事）: 定義に加えて、具体的な例や関連する事柄
- term（用語）: 辞書的定義に加えて、使用される文脈や具体例

【良いヒントの例】
- トランプ (person) → 「アメリカの実業家・政治家。不動産王として知られ、第45代大統領を務めた」
- ウクライナ (place) → 「東ヨーロッパに位置する国。首都はキーウで、黒海に面している」
- カイサン (event) → 「衆議院を解くこと。内閣の判断で行われ、総選挙につながる」
- ソニー (org) → 「日本の大手電機メーカー。プレイステーションやウォークマンで世界的に有名」
- インフレ (term) → 「物価が継続的に上昇する経済現象。通貨の価値が下がることを意味する」

【悪いヒントの例 - 避けること】
- 「あおり運転で書類送検された職業」← ニュース必須
- 「○○首相が訪問した国」← ニュース必須
- 「今話題の○○」← 曖昧すぎる
- 「東欧の国」← 短すぎる

【出力形式】
必ず以下のJSON形式のみを出力:
{"words":[{"answer":"カタカナ","clue":"ヒント文（20〜40文字）"}]}`;

  console.log(`  [Clues] Generating clues for ${keywords.length} keywords...`);
  const response = await callClaude(prompt, 'Clues');
  const result = extractJson(response, 'words');
  const words = result.words || [];

  // Merge article links from keywords
  const wordsWithLinks = words.map(w => {
    // Find the matching keyword by answer (reading)
    const keyword = keywords.find(k => k.reading === w.answer);
    return {
      ...w,
      articleLink: keyword?.articleLink || null
    };
  });

  // Log statistics
  const lengths = wordsWithLinks.map(w => w.answer.length);
  const avgLen = lengths.length > 0 ? (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1) : 0;
  console.log(`  [Clues] Generated ${wordsWithLinks.length} word-clue pairs (avg length: ${avgLen})`);
  wordsWithLinks.slice(0, 3).forEach(w => {
    console.log(`    - ${w.answer}: ${w.clue.substring(0, 30)}...`);
  });

  return wordsWithLinks;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use extractKeywords + generateClues instead
 */
async function generateWordsAndClues(newsItems, wordCount = 10) {
  const keywords = await extractKeywords(newsItems, wordCount);
  const words = await generateClues(keywords);
  return words;
}

module.exports = {
  filterSimilarNews,
  extractKeywords,
  generateClues,
  generateWordsAndClues
};
