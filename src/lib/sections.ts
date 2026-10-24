import type { ExtractedPage, ReadingSection } from '../types';

type SectionWord = {
  text: string;
  pageNumber: number;
  yOffset: number;
  pageHeight: number;
};

const TARGET_WORDS = 700;
const MAX_WORDS = 1000;
const MIN_FINAL_WORDS = 250;

function isSentenceEnd(word: string): boolean {
  return /[.!?]["')\]}”’]*$/u.test(word);
}

export function buildSections(pages: ExtractedPage[]): ReadingSection[] {
  const words: SectionWord[] = pages.flatMap((page) =>
    page.textItems.flatMap((item) =>
      item.text.match(/\S+/g)?.map((text) => ({
        text,
        pageNumber: page.pageNumber,
        yOffset: item.y,
        pageHeight: page.pageHeight,
      })) ?? [],
    ),
  );
  const sections: ReadingSection[] = [];
  let start = 0;

  while (start < words.length) {
    const remaining = words.length - start;
    let end = words.length;

    if (remaining > MAX_WORDS) {
      const targetEnd = start + TARGET_WORDS;
      // Leave enough room for a small final section to merge without exceeding the limit.
      const latestEnd = Math.min(start + MAX_WORDS, words.length - MIN_FINAL_WORDS);
      end = targetEnd;

      for (let candidate = targetEnd; candidate <= latestEnd; candidate += 1) {
        if (isSentenceEnd(words[candidate - 1].text)) {
          end = candidate;
          break;
        }
      }
    }

    const sectionWords = words.slice(start, end);
    const firstWord = sectionWords[0];
    const lastWord = sectionWords[sectionWords.length - 1];
    sections.push({
      id: `section-${sections.length + 1}`,
      text: sectionWords.map((word) => word.text).join(' '),
      wordCount: sectionWords.length,
      startPage: firstWord.pageNumber,
      endPage: lastWord.pageNumber,
      checkpoint: {
        pageNumber: lastWord.pageNumber,
        yOffset: lastWord.yOffset,
        pageHeight: lastWord.pageHeight,
      },
    });
    start = end;
  }

  const lastSection = sections.at(-1);
  const previousSection = sections.at(-2);
  if (lastSection && previousSection && lastSection.wordCount < MIN_FINAL_WORDS) {
    previousSection.text = `${previousSection.text} ${lastSection.text}`;
    previousSection.wordCount += lastSection.wordCount;
    previousSection.endPage = lastSection.endPage;
    previousSection.checkpoint = lastSection.checkpoint;
    sections.pop();
  }

  return sections;
}
