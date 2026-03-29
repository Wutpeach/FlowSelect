import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";

import { NeonCard } from "../../components/ui";
import { useTheme } from "../../contexts/ThemeContext";
import {
  consumeDownloaderDeckWheelDelta,
  getDownloaderDeckAnimationMs,
  moveDownloaderDeckIndex,
  type DownloaderDeckDirection,
} from "../../utils/downloaderDeck";

interface DownloaderDeckCard {
  id: string;
  title: string;
  body: ReactNode;
}

interface DownloaderDeckProps extends HTMLAttributes<HTMLDivElement> {
  cards: DownloaderDeckCard[];
}

interface DeckTransitionState {
  fromIndex: number;
  toIndex: number;
}

const DECK_EASE = [0.42, 0, 0.58, 1] as const;
const DECK_DURATION = 0.5;

export function DownloaderDeck({ cards, style, ...props }: DownloaderDeckProps) {
  const { colors } = useTheme();
  const shouldReduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [transitionState, setTransitionState] = useState<DeckTransitionState | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const wheelAccumulatorRef = useRef(0);
  const animationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationLockDurationMs = getDownloaderDeckAnimationMs(Boolean(shouldReduceMotion));

  useEffect(() => {
    return () => {
      if (animationUnlockTimerRef.current) {
        clearTimeout(animationUnlockTimerRef.current);
        animationUnlockTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isPointerInside) {
      wheelAccumulatorRef.current = 0;
    }
  }, [isPointerInside]);

  const lockAnimation = useCallback(() => {
    if (animationUnlockTimerRef.current) {
      clearTimeout(animationUnlockTimerRef.current);
    }

    setIsAnimating(true);
    animationUnlockTimerRef.current = setTimeout(() => {
      setIsAnimating(false);
      setTransitionState(null);
      animationUnlockTimerRef.current = null;
    }, animationLockDurationMs);
  }, [animationLockDurationMs]);

  const navigate = useCallback((nextDirection: DownloaderDeckDirection) => {
    if (cards.length < 2 || isAnimating) {
      return;
    }

    const nextIndex = moveDownloaderDeckIndex(activeIndex, nextDirection, cards.length);
    if (nextIndex === activeIndex) {
      return;
    }

    wheelAccumulatorRef.current = 0;
    setTransitionState({
      fromIndex: activeIndex,
      toIndex: nextIndex,
    });
    lockAnimation();
    setActiveIndex(nextIndex);
  }, [activeIndex, cards.length, isAnimating, lockAnimation]);

  useEffect(() => {
    const deckElement = deckRef.current;
    if (!deckElement) {
      return;
    }

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (cards.length < 2) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (isAnimating) {
        return;
      }

      const result = consumeDownloaderDeckWheelDelta(wheelAccumulatorRef.current, event.deltaY);
      wheelAccumulatorRef.current = result.accumulatedDelta;

      if (result.direction === 0) {
        return;
      }

      navigate(result.direction);
    };

    deckElement.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      deckElement.removeEventListener("wheel", handleWheel, true);
    };
  }, [cards.length, isAnimating, navigate]);

  const activeCard = cards[activeIndex];
  if (!activeCard) {
    return null;
  }

  const previewIndex =
    cards.length > 1
      ? moveDownloaderDeckIndex(activeIndex, 1, cards.length)
      : activeIndex;
  const previewCard =
    cards.length > 1 && previewIndex !== activeIndex
      ? cards[previewIndex]
      : null;

  const isVisuallyHovered = isPointerInside || isAnimating;
  const previewOffsetY = shouldReduceMotion ? 6 : 10;
  const hiddenOffsetY = shouldReduceMotion ? 16 : 24;
  const previewScale = shouldReduceMotion ? 0.985 : 0.965;
  const hiddenScale = shouldReduceMotion ? 0.97 : 0.94;
  const previewOpacity = isVisuallyHovered ? 0.74 : 0.62;

  const deckViewportStyle: CSSProperties = {
    position: "relative",
    height: 104,
    overscrollBehavior: "contain",
  };

  const cardWrapperStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
  };

  const renderCard = (card: DownloaderDeckCard, interactive: boolean) => (
    <NeonCard
      className="rounded-xl p-0"
      style={{
        height: "100%",
        padding: "9px 11px",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        overflow: "hidden",
        pointerEvents: interactive ? "auto" : "none",
        userSelect: interactive ? "auto" : "none",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
        {card.title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minHeight: 0 }}>
        {card.body}
      </div>
    </NeonCard>
  );

  const getCardAnimationState = (index: number) => {
    const isActive = index === activeIndex;
    const isPreview = previewCard ? index === previewIndex : false;
    const isMovingToFront = transitionState?.toIndex === index;
    const isMovingToBack = transitionState?.fromIndex === index && transitionState.toIndex !== index;

    if (isMovingToFront) {
      return {
        animate: {
          y: [previewOffsetY, 3, 0],
          scale: [previewScale, 0.992, 1],
          opacity: [previewOpacity, 0.94, 1],
        },
        transition: shouldReduceMotion
          ? { duration: 0.18, ease: DECK_EASE }
          : {
              y: { duration: DECK_DURATION, ease: DECK_EASE, times: [0, 0.48, 1] },
              scale: { duration: DECK_DURATION, ease: DECK_EASE, times: [0, 0.48, 1] },
              opacity: { duration: DECK_DURATION, ease: DECK_EASE, times: [0, 0.5, 1] },
            },
        zIndex: 3,
        interactive: true,
      };
    }

    if (isMovingToBack) {
      return {
        animate: {
          y: [0, hiddenOffsetY, previewOffsetY],
          scale: [1, hiddenScale, previewScale],
          opacity: [1, 0, 0, previewOpacity],
        },
        transition: shouldReduceMotion
          ? { duration: 0.18, ease: DECK_EASE }
          : {
              y: { duration: DECK_DURATION, ease: DECK_EASE, times: [0, 0.32, 1] },
              scale: { duration: DECK_DURATION, ease: DECK_EASE, times: [0, 0.32, 1] },
              opacity: { duration: DECK_DURATION, ease: DECK_EASE, times: [0, 0.12, 0.62, 1] },
            },
        zIndex: 1,
        interactive: false,
      };
    }

    if (isActive) {
      return {
        animate: {
          y: 0,
          scale: 1,
          opacity: 1,
        },
        transition: { duration: DECK_DURATION, ease: DECK_EASE },
        zIndex: 3,
        interactive: true,
      };
    }

    if (isPreview) {
      return {
        animate: {
          y: previewOffsetY,
          scale: previewScale,
          opacity: previewOpacity,
        },
        transition: { duration: DECK_DURATION, ease: DECK_EASE },
        zIndex: 1,
        interactive: false,
      };
    }

    return {
        animate: {
          y: hiddenOffsetY,
          scale: hiddenScale,
          opacity: 0,
        },
        transition: { duration: DECK_DURATION, ease: DECK_EASE },
        zIndex: 0,
        interactive: false,
      };
  };

  return (
    <div
      {...props}
      ref={deckRef}
      onMouseEnter={() => setIsPointerInside(true)}
      onMouseLeave={() => setIsPointerInside(false)}
      style={{ display: "grid", gap: 0, width: "100%", ...style }}
    >
      <div style={deckViewportStyle}>
        {cards.map((card, index) => {
          const cardState = getCardAnimationState(index);

          return (
            <motion.div
              key={card.id}
              initial={false}
              animate={cardState.animate}
              transition={cardState.transition}
              aria-hidden={cardState.interactive ? undefined : true}
              style={{
                ...cardWrapperStyle,
                zIndex: cardState.zIndex,
                pointerEvents: cardState.interactive ? "auto" : "none",
              }}
            >
              {renderCard(card, cardState.interactive)}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
