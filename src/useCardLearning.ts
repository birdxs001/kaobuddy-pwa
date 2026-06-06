import { useCallback, useRef, useState } from "react";
import type { CardProgress, LearnCard, StudyTask } from "./types";
import { createId, storage } from "./storage";
import { nowIso } from "./utils";

export function useCardLearning() {
  const [cardProgress, setCardProgress] = useState<Record<string, CardProgress>>({});
  const [cardLearningRound, setCardLearningRound] = useState(1);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const cardDragLock = useRef(false);
  const [cardQueue, setCardQueue] = useState<LearnCard[]>([]);
  const [streamingCards, setStreamingCards] = useState<LearnCard[]>([]);
  const [isStreamingCards, setIsStreamingCards] = useState(false);
  const [streamingAbort, setStreamingAbort] = useState<AbortController | null>(null);

  const resetCardProgress = useCallback((cards: LearnCard[]) => {
    setCardProgress(Object.fromEntries(cards.map((c) => [c.id, "unknown" as CardProgress])));
    setCardLearningRound(1);
    setCurrentCardIndex(0);
    setIsCardFlipped(false);
    setCardQueue(cards);
  }, []);

  const markCard = useCallback((cardId: string, progress: CardProgress) => {
    setCardProgress((prev) => ({ ...prev, [cardId]: progress }));
  }, []);

  const goToNextCard = useCallback(() => {
    setCurrentCardIndex((i) => (i + 1 < cardQueue.length ? i + 1 : i));
    setIsCardFlipped(false);
  }, [cardQueue.length]);

  const goToPrevCard = useCallback(() => {
    setCurrentCardIndex((i) => Math.max(0, i - 1));
    setIsCardFlipped(false);
  }, []);

  const flipCard = useCallback(() => setIsCardFlipped((v) => !v), []);

  const cancelStreaming = useCallback(() => {
    if (streamingAbort) {
      streamingAbort.abort();
      setStreamingAbort(null);
      setIsStreamingCards(false);
    }
  }, [streamingAbort]);

  const loadSavedCards = useCallback((module: StudyTask) => {
    if (module.cards?.length) {
      resetCardProgress(module.cards);
      return true;
    }
    return false;
  }, [resetCardProgress]);

  const saveCardsToModule = useCallback(async (module: StudyTask, cards: LearnCard[]) => {
    await storage.saveTask({
      ...module,
      cards,
      updated_at: nowIso(),
    });
  }, []);

  return {
    cardProgress, setCardProgress,
    cardLearningRound, setCardLearningRound,
    currentCardIndex, setCurrentCardIndex,
    isCardFlipped, setIsCardFlipped,
    cardDragLock,
    cardQueue, setCardQueue,
    streamingCards, setStreamingCards,
    isStreamingCards, setIsStreamingCards,
    streamingAbort, setStreamingAbort,
    resetCardProgress,
    markCard,
    goToNextCard,
    goToPrevCard,
    flipCard,
    cancelStreaming,
    loadSavedCards,
    saveCardsToModule,
  } as const;
}
