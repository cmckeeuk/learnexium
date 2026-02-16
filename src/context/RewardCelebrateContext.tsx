import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  View,
} from 'react-native';
import {
  RewardCelebrateOverlay,
  ActiveRewardCelebrateAnimation,
} from '../components/animations/RewardCelebrateOverlay';

export type RewardCelebrateType = 'xp' | 'badge' | 'certificate';
export type RewardCelebrateTarget = 'progressTab' | 'progressHeader';
export type RewardCelebrateTokenVariant = 'default' | 'flashcards-image';

export interface RewardCelebrateRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RewardCelebrateRequest {
  eventId: string;
  type: RewardCelebrateType;
  source?: RewardCelebrateRect;
  xpDelta?: number;
  badgeId?: string;
  tokenVariant?: RewardCelebrateTokenVariant;
}

interface RewardCelebrateContextValue {
  emitRewardAnimation: (request: RewardCelebrateRequest) => void;
  registerAnimationTarget: (
    target: RewardCelebrateTarget,
    rect: RewardCelebrateRect | null,
  ) => void;
  setProgressTabActive: (active: boolean) => void;
  clearAnimationDedupe: () => void;
}

interface QueuedRewardCelebrateAnimation extends RewardCelebrateRequest {
  enqueuedAt: number;
}

const MAX_QUEUE_LENGTH = 8;
const QUEUE_STAGGER_MS = 140;
const REDUCED_MOTION_DURATION_MS = 2200;
const STANDARD_DURATION_MS = 4000;
const EVENT_DEDUPE_WINDOW_MS = 8000;

const RewardCelebrateContext = createContext<RewardCelebrateContextValue | null>(null);

function logAnimationEvent(name: string, payload: Record<string, unknown>) {
  if (__DEV__) {
    console.log(`[RewardAnimation] ${name}`, payload);
  }
}

function buildFallbackTarget(): RewardCelebrateRect {
  const { width, height } = Dimensions.get('window');
  return {
    x: width - 46,
    y: height - 72,
    width: 24,
    height: 24,
  };
}

function buildFallbackSource(): RewardCelebrateRect {
  const { width, height } = Dimensions.get('window');
  return {
    x: width / 2 - 12,
    y: height * 0.45,
    width: 24,
    height: 24,
  };
}

export function RewardCelebrateProvider({ children }: { children: React.ReactNode }) {
  const targetsRef = useRef<Record<RewardCelebrateTarget, RewardCelebrateRect | null>>({
    progressTab: null,
    progressHeader: null,
  });
  const emittedEventIdsRef = useRef<Map<string, number>>(new Map());
  const queueRef = useRef<QueuedRewardCelebrateAnimation[]>([]);
  const processingRef = useRef(false);
  const [queueTick, setQueueTick] = useState(0);
  const [activeAnimation, setActiveAnimation] = useState<ActiveRewardCelebrateAnimation | null>(null);
  const [progressTabActive, setProgressTabActive] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduceMotionEnabled(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const registerAnimationTarget = useCallback((
    target: RewardCelebrateTarget,
    rect: RewardCelebrateRect | null,
  ) => {
    targetsRef.current[target] = rect;
  }, []);

  const chooseTarget = useCallback((): {
    target: RewardCelebrateRect;
    usedFallback: boolean;
  } => {
    const headerTarget = targetsRef.current.progressHeader;
    const tabTarget = targetsRef.current.progressTab;

    if (progressTabActive && headerTarget) {
      return { target: headerTarget, usedFallback: false };
    }
    if (tabTarget) {
      return { target: tabTarget, usedFallback: false };
    }
    return { target: buildFallbackTarget(), usedFallback: true };
  }, [progressTabActive]);

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    processingRef.current = true;
    const { target, usedFallback } = chooseTarget();
    const source = next.source ?? buildFallbackSource();
    const progress = new Animated.Value(0);
    const duration = reduceMotionEnabled ? REDUCED_MOTION_DURATION_MS : STANDARD_DURATION_MS;

    if (usedFallback) {
      logAnimationEvent('reward_animation_fallback_used', {
        eventId: next.eventId,
        type: next.type,
      });
    }

    logAnimationEvent('reward_animation_started', {
      eventId: next.eventId,
      type: next.type,
      xpDelta: next.xpDelta ?? null,
    });

    setActiveAnimation({
      key: `${next.eventId}-${Date.now()}`,
      type: next.type,
      source,
      target,
      progress,
      xpDelta: next.xpDelta,
      badgeId: next.badgeId,
      tokenVariant: next.tokenVariant ?? 'default',
      reducedMotion: reduceMotionEnabled,
    });

    Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      setActiveAnimation(null);

      if (finished) {
        logAnimationEvent('reward_animation_completed', {
          eventId: next.eventId,
          type: next.type,
          xpDelta: next.xpDelta ?? null,
        });
      }

      processingRef.current = false;
      setTimeout(() => {
        setQueueTick((v) => v + 1);
      }, QUEUE_STAGGER_MS);
    });
  }, [chooseTarget, reduceMotionEnabled]);

  useEffect(() => {
    processQueue();
  }, [queueTick, processQueue]);

  const clearAnimationDedupe = useCallback(() => {
    emittedEventIdsRef.current.clear();
  }, []);

  const emitRewardAnimation = useCallback((request: RewardCelebrateRequest) => {
    if (!request.eventId) return;

    const now = Date.now();
    for (const [eventId, seenAt] of emittedEventIdsRef.current.entries()) {
      if (now - seenAt > EVENT_DEDUPE_WINDOW_MS) {
        emittedEventIdsRef.current.delete(eventId);
      }
    }

    const lastSeenAt = emittedEventIdsRef.current.get(request.eventId);
    if (lastSeenAt && now - lastSeenAt < EVENT_DEDUPE_WINDOW_MS) return;

    emittedEventIdsRef.current.set(request.eventId, now);

    const queuedItem: QueuedRewardCelebrateAnimation = {
      ...request,
      enqueuedAt: now,
    };

    if (queueRef.current.length >= MAX_QUEUE_LENGTH) {
      queueRef.current.shift();
    }
    queueRef.current.push(queuedItem);
    setQueueTick((v) => v + 1);
  }, []);

  const value = useMemo<RewardCelebrateContextValue>(() => ({
    emitRewardAnimation,
    registerAnimationTarget,
    setProgressTabActive,
    clearAnimationDedupe,
  }), [emitRewardAnimation, registerAnimationTarget, clearAnimationDedupe]);

  return (
    <RewardCelebrateContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <RewardCelebrateOverlay
          activeAnimation={activeAnimation}
          pulseAnimation={null}
        />
      </View>
    </RewardCelebrateContext.Provider>
  );
}

export function useRewardCelebrate() {
  const context = useContext(RewardCelebrateContext);
  if (!context) {
    throw new Error('useRewardCelebrate must be used inside RewardCelebrateProvider');
  }
  return context;
}
