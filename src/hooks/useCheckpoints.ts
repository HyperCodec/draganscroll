import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { CheckpointMarker, ReadingSection } from '../types';

type UseCheckpointsResult = {
  markers: CheckpointMarker[];
  currentSection: number;
};

export function useCheckpoints(
  sections: ReadingSection[],
  pagesContainerRef: RefObject<HTMLDivElement | null>,
): UseCheckpointsResult {
  const [markers, setMarkers] = useState<CheckpointMarker[]>([]);
  const [currentSection, setCurrentSection] = useState(0);

  useEffect(() => {
    const pagesContainer = pagesContainerRef.current;
    if (!pagesContainer || sections.length === 0) {
      setMarkers([]);
      setCurrentSection(0);
      return;
    }

    const fired = new Set<string>();
    let previousBottom: number | null = null;
    let animationFrame = 0;
    let shouldCheckCrossings = false;
    const handleScroll = () => scheduleUpdate(true);
    const handleResize = () => scheduleUpdate(false);

    function updatePositions(checkForCrossings: boolean) {
      const container = pagesContainerRef.current;
      if (!container) return;

      const containerTop = container.getBoundingClientRect().top + window.scrollY;
      const positions = sections.flatMap((section, index) => {
        const page = container.querySelector<HTMLElement>(
          `[data-page-number="${section.checkpoint.pageNumber}"]`,
        );
        if (!page || !section.checkpoint.pageHeight) return [];

        const pageTop = page.getBoundingClientRect().top + window.scrollY - containerTop;
        const yRatio = Math.max(
          0,
          Math.min(1, section.checkpoint.yOffset / section.checkpoint.pageHeight),
        );
        const top = pageTop + yRatio * page.clientHeight;

        return [{
          id: section.id,
          sectionNumber: index + 1,
          wordCount: section.wordCount,
          checkpointWords: section.text.split(/\s+/).slice(-6).join(' '),
          top,
          documentY: containerTop + top,
          section,
        }];
      });
      const viewportBottom = window.scrollY + window.innerHeight;

      setMarkers((current) => {
        if (
          current.length === positions.length &&
          current.every((marker, index) =>
            marker.id === positions[index].id &&
            marker.wordCount === positions[index].wordCount &&
            marker.checkpointWords === positions[index].checkpointWords &&
            Math.abs(marker.top - positions[index].top) < 0.5,
          )
        ) {
          return current;
        }
        return positions.map(({ id, sectionNumber, wordCount, checkpointWords, top }) => ({
          id,
          sectionNumber,
          wordCount,
          checkpointWords,
          top,
        }));
      });

      const completedCount = positions.filter(({ documentY }) => documentY <= viewportBottom).length;
      const activeSection = Math.min(completedCount + 1, sections.length);
      setCurrentSection((current) => current === activeSection ? current : activeSection);

      if (checkForCrossings && previousBottom !== null && viewportBottom > previousBottom) {
        for (const position of positions) {
          if (
            position.documentY > previousBottom &&
            position.documentY <= viewportBottom &&
            !fired.has(position.id)
          ) {
            fired.add(position.id);
            const firstWords = position.section.text.split(/\s+/).slice(0, 10).join(' ');
            console.log(`Checkpoint reached: section ${position.sectionNumber}`, {
              wordCount: position.wordCount,
              firstWords,
              checkpointWords: position.checkpointWords,
            });
          }
        }
      }
      previousBottom = viewportBottom;
    }

    function scheduleUpdate(checkCrossings: boolean) {
      shouldCheckCrossings ||= checkCrossings;
      if (animationFrame) return;

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const check = shouldCheckCrossings;
        shouldCheckCrossings = false;
        updatePositions(check);
      });
    }

    updatePositions(false);
    const resizeObserver = new ResizeObserver(() => scheduleUpdate(false));
    resizeObserver.observe(pagesContainer);
    pagesContainer.querySelectorAll('.page-shell').forEach((page) => resizeObserver.observe(page));
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [pagesContainerRef, sections]);

  return { markers, currentSection };
}
