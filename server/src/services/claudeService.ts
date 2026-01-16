import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Concurrency limiter
function createLimit(concurrency: number) {
  let active = 0;
  const queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  const next = () => {
    if (active < concurrency && queue.length > 0) {
      active++;
      const { fn, resolve, reject } = queue.shift()!;
      fn().then(resolve).catch(reject).finally(() => {
        active--;
        next();
      });
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

const limit = createLimit(2);
const TIMEOUT_MS = 600000; // 10分

export interface Keyword {
  word: string;
  reading: string;
  type: string;
  newsContext: string;
  articleIndex: number;
  articleId?: number;
  articleLink?: string;
  articleTitle?: string;
}

export interface WordClue {
  answer: string;
  clue: string;
  articleLink?: string;
  articleId?: number;
}

/**
 * Call Claude CLI with a prompt
 */
async function callClaude(prompt: string, label: string = 'Claude'): Promise<string> {
  return limit(async () => {
    const tempFile = path.join(os.tmpdir(), `crossword-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, prompt, 'utf8');

    console.log(`  [${label}] Calling Claude CLI...`);
    const startTime = Date.now();

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { fs.unlinkSync(tempFile); } catch {}
        reject(new Error(`${label} timeout`));
      }, TIMEOUT_MS);

      try {
        const command = `type "${tempFile}" | claude -p --model sonnet --permission-mode default --output-format text`;

        const stdout = execSync(command, {
          encoding: 'utf8',
          timeout: TIMEOUT_MS,
          shell: true as unknown as string,
          maxBuffer: 10 * 1024 * 1024
        });

        clearTimeout(timeout);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  [${label}] Response received (${elapsed}s)`);

        try { fs.unlinkSync(tempFile); } catch {}
        resolve(stdout);
      } catch (error) {
        clearTimeout(timeout);
        try { fs.unlinkSync(tempFile); } catch {}
        console.error(`  [${label}] Error:`, (error as Error).message);
        reject(new Error(`${label} failed: ` + (error as Error).message));
      }
    });
  });
}

/**
 * Extract JSON from Claude response
 */
function extractJson<T>(response: string, key: string): T {
  const pattern = new RegExp(`\\{[\\s\\S]*"${key}"[\\s\\S]*\\}`);
  const match = response.match(pattern);
  if (!match) {
    console.error('Claude response:', response.substring(0, 500));
    throw new Error(`No JSON with "${key}" found in response`);
  }
  return JSON.parse(match[0]);
}

/**
 * Filter similar news headlines
 */
export async function filterSimilarNews<T extends { title: string }>(
  newsItems: T[]
): Promise<T[]> {
  // Remove exact duplicates
  const seen = new Set<string>();
  const uniqueItems = newsItems.filter(item => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  console.log(`  [Filter] Exact duplicates removed: ${newsItems.length} → ${uniqueItems.length}`);

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
  const result = extractJson<{ selected: number[] }>(response, 'selected');
  const selectedIndices = result.selected || [];

  const filtered = selectedIndices
    .map(i => uniqueItems[i - 1])
    .filter(item => item !== undefined);

  console.log(`  [Filter] Similar content filtered: ${uniqueItems.length} → ${filtered.length}`);

  return filtered;
}

/**
 * Extract keywords from a batch of articles (internal helper)
 */
async function extractKeywordsBatch(
  articles: Array<{ id?: number; title: string; link?: string; content?: string }>,
  count: number,
  batchOffset: number
): Promise<Keyword[]> {
  const articlesText = articles.map((item, index) => {
    if (item.content && item.content.length > 0) {
      return `[記事${index + 1}]【${item.title}】\n${item.content}`;
    }
    return `[記事${index + 1}]【${item.title}】`;
  }).join('\n\n');

  const prompt = `【重要】計画や説明は不要です。JSON形式のみを出力してください。

あなたはクロスワードパズルのキーワード選定者です。以下のニュース記事から、クロスワードパズルに適したキーワードを抽出してください。

ニュース記事:
${articlesText}

【抽出条件】
1. ${count}個のキーワードを抽出
2. 文字数のバリエーション:
   - 2〜3文字: ${Math.ceil(count * 0.5)}個（端埋め用に多めに）
   - 4〜5文字: ${Math.ceil(count * 0.35)}個
   - 6〜8文字: ${Math.floor(count * 0.15)}個
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
  {"word":"iPhone","reading":"アイフォン","type":"brand","newsContext":"Apple新製品","articleIndex":2}
]}`;

  const response = await callClaude(prompt, 'Keywords');
  const result = extractJson<{ keywords: Keyword[] }>(response, 'keywords');
  const keywords = result.keywords || [];

  // Map article info to keywords (adjust articleIndex with batch offset)
  return keywords.map(k => {
    const idx = (k.articleIndex || 1) - 1;
    const article = articles[idx] || articles[0];
    return {
      ...k,
      articleIndex: idx + batchOffset + 1,
      articleId: article?.id,
      articleLink: article?.link || undefined,
      articleTitle: article?.title || undefined
    };
  });
}

/**
 * Extract keywords from articles (batch processing)
 */
export async function extractKeywords(
  articles: Array<{ id?: number; title: string; link?: string; content?: string }>,
  count: number = 30
): Promise<Keyword[]> {
  const BATCH_SIZE = 5;
  const limitedArticles = articles.slice(0, 20);
  const totalBatches = Math.ceil(limitedArticles.length / BATCH_SIZE);
  const keywordsPerBatch = Math.ceil(count / totalBatches);

  console.log(`  [Keywords] Processing ${limitedArticles.length} articles in ${totalBatches} batches (${keywordsPerBatch} keywords each)...`);

  const allKeywords: Keyword[] = [];

  for (let i = 0; i < limitedArticles.length; i += BATCH_SIZE) {
    const batch = limitedArticles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`  [Keywords] Batch ${batchNum}/${totalBatches} (${batch.length} articles)...`);

    const keywords = await extractKeywordsBatch(batch, keywordsPerBatch, i);
    allKeywords.push(...keywords);

    console.log(`    → Extracted ${keywords.length} keywords`);
  }

  // Remove duplicates by reading
  const seen = new Set<string>();
  const uniqueKeywords = allKeywords.filter(k => {
    if (seen.has(k.reading)) return false;
    seen.add(k.reading);
    return true;
  });

  console.log(`  [Keywords] Total: ${uniqueKeywords.length} unique keywords (from ${allKeywords.length})`);
  uniqueKeywords.slice(0, 5).forEach(k => {
    console.log(`    - ${k.reading} (${k.type}): ${k.newsContext}`);
  });

  return uniqueKeywords;
}

/**
 * Generate clues for a batch of keywords (internal helper)
 */
async function generateCluesBatch(keywords: Keyword[]): Promise<WordClue[]> {
  const keywordList = keywords.map(k =>
    `- ${k.reading} (${k.type}): ${k.newsContext}`
  ).join('\n');

  const prompt = `【重要】計画や説明は不要です。JSON形式のみを出力してください。

あなたはクロスワードパズルのヒント作成者です。以下のキーワードに対して、「時事ネタまたは一般知識」で解けるヒント文を作成してください。

【キーワードリスト】
${keywordList}

【ヒント作成ルール】
1. ヒント文は50〜70文字程度で、詳しい説明と背景情報を含める
2. 【重要】ヒント文に答えの単語を絶対に含めないこと（漢字・カタカナ・ひらがな全て禁止）
3. あなたの一般知識を活用して、詳しく説明する
4. 2つのルートで解答可能にする:
   - 時事ネタルート: ニュースを追っている人が解ける
   - 一般知識ルート: ニュースを知らなくても解ける

【悪い例】答えが「ハシカ」の場合
× 「麻疹。感染症のひとつ」← 答えの漢字表記が入っている
○ 「高熱と発疹が特徴的な感染症。ワクチン接種が推奨される」

【単語タイプ別の戦略】
- person（人名）: 国籍、職業、代表作、所属、経歴などを含める
- place（地名）: 地理的位置、首都、人口規模、有名な特徴を含める
- org（組織）: 業種、設立年や本社所在地、代表的な製品やサービス
- event（出来事）: 定義に加えて、具体的な例や関連する事柄
- term（用語）: 辞書的定義に加えて、使用される文脈や具体例

【良いヒントの例】
- トランプ (person) → 「アメリカの実業家・政治家。不動産王として知られ、第45代大統領を務めた」
- ウクライナ (place) → 「東ヨーロッパに位置する国。首都はキーウで、黒海に面している」

【出力形式】
必ず以下のJSON形式のみを出力:
{"words":[{"answer":"カタカナ","clue":"ヒント文（50〜70文字）"}]}`;

  const response = await callClaude(prompt, 'Clues');
  const result = extractJson<{ words: Array<{ answer: string; clue: string }> }>(response, 'words');
  const words = result.words || [];

  // Merge article links from keywords
  return words.map(w => {
    const keyword = keywords.find(k => k.reading === w.answer);
    return {
      ...w,
      articleLink: keyword?.articleLink || undefined,
      articleId: keyword?.articleId
    };
  });
}

/**
 * Generate clues for keywords (batch processing)
 */
export async function generateClues(keywords: Keyword[]): Promise<WordClue[]> {
  const BATCH_SIZE = 20;
  const totalBatches = Math.ceil(keywords.length / BATCH_SIZE);

  console.log(`  [Clues] Processing ${keywords.length} keywords in ${totalBatches} batches...`);

  const allClues: WordClue[] = [];

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`  [Clues] Batch ${batchNum}/${totalBatches} (${batch.length} keywords)...`);

    const clues = await generateCluesBatch(batch);
    allClues.push(...clues);

    console.log(`    → Generated ${clues.length} clues`);
  }

  const lengths = allClues.map(w => w.answer.length);
  const avgLen = lengths.length > 0 ? (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1) : '0';
  console.log(`  [Clues] Total: ${allClues.length} word-clue pairs (avg length: ${avgLen})`);
  allClues.slice(0, 3).forEach(w => {
    console.log(`    - ${w.answer}: ${w.clue.substring(0, 30)}...`);
  });

  return allClues;
}
