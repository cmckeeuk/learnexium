import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, ActivityIndicator, Image, Alert, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent, Dimensions, TouchableOpacity, StyleSheet, Platform, ImageSourcePropType } from 'react-native';
import { YStack, Text, View, XStack } from 'tamagui';
import { Feather } from '@expo/vector-icons';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';
import { useAPI } from '../context/APIContext';
import { CourseDetail, Lesson, ContentBlock, TextSpan } from '../api/course/CourseAPI';
import { LessonState, RewardMutationResult } from '../api/user/UserAPI';
import { useRoute, RouteProp } from '@react-navigation/native';
import { QuizBlock } from '../components/blocks/QuizBlock';
import { FlashcardsBlock } from '../components/blocks/FlashcardsBlock';
import LockedLessonScreen from '../components/LockedLessonScreen';
import { buildVersionedImageUri, prefetchImages } from '../utils/imageCache';
import {
  useRewardAnimation,
} from '../context/RewardAnimationContext';
import type { RewardAnimationRect } from '../context/RewardAnimationContext';
import { useRewardToast } from '../context/RewardToastContext';

type LessonRouteProp = RouteProp<{ params: { courseId: string; lessonId: string } }, 'params'>;

const nativeLessonTitleFontFamily = Platform.select({
  ios: 'AvenirNext-Heavy',
  android: 'sans-serif-black',
  default: undefined,
});

const nativeHeadingFontFamily = Platform.select({
  ios: 'AvenirNext-Bold',
  android: 'sans-serif-medium',
  default: undefined,
});

const BADGE_TITLE_BY_ID: Record<string, string> = {
  'first-steps': 'First Steps',
  'card-crusher': 'Card Crusher',
  'quiz-starter': 'Quiz Starter',
  'perfect-score': 'Perfect Score',
  'on-a-roll': 'On a Roll',
  'course-finisher': 'Course Finisher',
};
const LESSON_COMPLETION_BOTTOM_THRESHOLD_PX = 64;

function formatBadgeTitle(badgeId: string): string {
  const knownTitle = BADGE_TITLE_BY_ID[badgeId];
  if (knownTitle) return knownTitle;
  return badgeId
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function LessonScreen() {
  const { courseAPI, userAPI } = useAPI();
  const { emitRewardAnimation } = useRewardAnimation();
  const { showRewardToast } = useRewardToast();
  const route = useRoute<LessonRouteProp>();
  const { courseId, lessonId } = route.params;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [courseDetail, setCourseDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canAccess, setCanAccess] = useState<boolean>(true);
  const [lessonState, setLessonState] = useState<LessonState>('not-started');

  // ─── Floating mini-player state ──────────────────────────────────────────
  const [floatingVideoId, setFloatingVideoId] = useState<string | null>(null);
  const [floatingPlaying, setFloatingPlaying] = useState(false);
  const [floatingSeekTime, setFloatingSeekTime] = useState(0);
  const [floatingDismissed, setFloatingDismissed] = useState(false);
  const [videoBlockY, setVideoBlockY] = useState<number>(0); // scroll position when video started playing
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [miniPlayerPlaying, setMiniPlayerPlaying] = useState(false);
  const [inlinePlayingVideoId, setInlinePlayingVideoId] = useState<string | null>(null);
  const [resumeInlineToken, setResumeInlineToken] = useState(0);
  const [resumeInlineVideoId, setResumeInlineVideoId] = useState<string | null>(null);
  const [resumeInlineSeekTime, setResumeInlineSeekTime] = useState(0);
  const activePlayerRef = useRef<YoutubeIframeRef | null>(null);
  const miniPlayerRef = useRef<YoutubeIframeRef | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const showMiniPlayerRef = useRef(false);
  const prevShowMiniPlayerRef = useRef(false);
  const handoffInProgressRef = useRef(false);
  const lastHandoffAtRef = useRef(0);
  const shouldResumeInlineRef = useRef(false);
  const resumingInlineVideoRef = useRef<string | null>(null);
  const resumeInlineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Scroll-to-bottom completion tracking ────────────────────────────────
  const completedRef = useRef(false);
  const contentHeightRef = useRef(0);
  const viewHeightRef = useRef(0);

  const markLessonCompletedOnce = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setLessonState('completed');
    void userAPI.markLessonCompleted(courseId, lessonId).catch((error) => {
      console.warn('[LessonScreen] Failed to persist lesson completion', error);
    });
  }, [courseId, lessonId, userAPI]);

  const tryCompleteByScrollPosition = useCallback((
    contentHeight: number,
    viewportHeight: number,
    offsetY: number,
  ) => {
    if (completedRef.current) return;
    if (contentHeight <= 0 || viewportHeight <= 0) return;

    const distanceFromBottom = contentHeight - viewportHeight - offsetY;
    if (distanceFromBottom <= LESSON_COMPLETION_BOTTOM_THRESHOLD_PX) {
      markLessonCompletedOnce();
    }
  }, [markLessonCompletedOnce]);

  const markInlineResuming = useCallback((videoId: string) => {
    if (resumeInlineTimeoutRef.current) {
      clearTimeout(resumeInlineTimeoutRef.current);
    }
    resumingInlineVideoRef.current = videoId;
    resumeInlineTimeoutRef.current = setTimeout(() => {
      if (resumingInlineVideoRef.current === videoId) {
        resumingInlineVideoRef.current = null;
      }
      resumeInlineTimeoutRef.current = null;
    }, 2500);
  }, []);

  const handoffToInlinePlayer = useCallback(async () => {
    if (handoffInProgressRef.current) {
      return;
    }
    if (!floatingVideoId) {
      return;
    }
    handoffInProgressRef.current = true;
    shouldResumeInlineRef.current = false; // prevent duplicate triggers while handing off
    lastHandoffAtRef.current = Date.now();
    const nextVideoId = floatingVideoId;

    try {
      // Start inline playback immediately, then refine seek position.
      setMiniPlayerPlaying(false);
      markInlineResuming(nextVideoId);
      setInlinePlayingVideoId(nextVideoId);

      const miniTime = await miniPlayerRef.current?.getCurrentTime?.();
      if (typeof miniTime === 'number' && !Number.isNaN(miniTime)) {
        setFloatingSeekTime(miniTime);
        setResumeInlineSeekTime(miniTime);
        await activePlayerRef.current?.seekTo?.(miniTime, true);
        await (activePlayerRef.current as any)?.playVideo?.();
      } else {
        setResumeInlineSeekTime(floatingSeekTime);
        await (activePlayerRef.current as any)?.playVideo?.();
      }
      setResumeInlineVideoId(nextVideoId);
      setResumeInlineToken((v) => v + 1);
    } catch {
      // Best effort: ignore resume failures.
    } finally {
      handoffInProgressRef.current = false;
    }
  }, [floatingSeekTime, floatingVideoId, markInlineResuming]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      scrollOffsetRef.current = contentOffset.y;

      // Update mini-player visibility (show only while video is actively playing)
      if (floatingVideoId && !floatingDismissed) {
        const shouldShowMini = floatingPlaying && contentOffset.y > videoBlockY + 300;
        setShowMiniPlayer(shouldShowMini);
        showMiniPlayerRef.current = shouldShowMini;
      }

      // Completion tracking
      tryCompleteByScrollPosition(
        contentSize.height,
        layoutMeasurement.height,
        contentOffset.y,
      );
    },
    [floatingVideoId, floatingDismissed, floatingPlaying, videoBlockY, tryCompleteByScrollPosition],
  );

  const handleContentSizeChange = useCallback(
    (_w: number, h: number) => {
      contentHeightRef.current = h;
      tryCompleteByScrollPosition(
        h,
        viewHeightRef.current,
        scrollOffsetRef.current,
      );
    },
    [tryCompleteByScrollPosition],
  );

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewHeightRef.current = e.nativeEvent.layout.height;
      tryCompleteByScrollPosition(
        contentHeightRef.current,
        e.nativeEvent.layout.height,
        scrollOffsetRef.current,
      );
    },
    [tryCompleteByScrollPosition],
  );

  useEffect(() => {
    loadLesson();
  }, [courseId, lessonId]);

  useEffect(() => {
    if (!lesson) return;
    const imageUris = lesson.blocks
      .filter((block: any) => block?.type === 'image' && typeof block.src === 'string')
      .map((block: any) => buildVersionedImageUri(block.src, block.version, block.hash));
    prefetchImages(imageUris);
  }, [lesson]);

  useEffect(() => {
    showMiniPlayerRef.current = showMiniPlayer;
  }, [showMiniPlayer, inlinePlayingVideoId]);

  useEffect(() => {
    if (
      prevShowMiniPlayerRef.current &&
      !showMiniPlayer &&
      shouldResumeInlineRef.current &&
      !handoffInProgressRef.current &&
      Date.now() - lastHandoffAtRef.current > 400
    ) {
      prevShowMiniPlayerRef.current = showMiniPlayer;
      const timer = setTimeout(() => {
        void handoffToInlinePlayer();
      }, 80);
      return () => clearTimeout(timer);
    }
    prevShowMiniPlayerRef.current = showMiniPlayer;
  }, [showMiniPlayer, handoffToInlinePlayer, floatingVideoId]);

  useEffect(() => {
    return () => {
      if (resumeInlineTimeoutRef.current) {
        clearTimeout(resumeInlineTimeoutRef.current);
      }
    };
  }, []);

  const loadLesson = async () => {
    try {
      setLoading(true);
      // Reset per-lesson completion tracking in case this screen instance is reused
      // by navigation (e.g. Home "Continue Lesson" deep-linking into Courses stack).
      completedRef.current = false;
      contentHeightRef.current = 0;
      viewHeightRef.current = 0;
      scrollOffsetRef.current = 0;
      setLessonState('not-started');

      const detail = await courseAPI.getCourseDetail(courseId);
      const lessonData = detail.lessons.find(l => l.lessonId === lessonId);
      
      if (!lessonData) throw new Error('Lesson not found');
      
      // Check if user can access this lesson
      const hasAccess = await userAPI.canAccessLesson(
        courseId, 
        lessonId, 
        lessonData.premium ?? false
      );
      
      setLesson(lessonData);
      setCourseDetail(detail);
      setCanAccess(hasAccess);

      // Mark lesson as opened (in-progress) for progress tracking
      if (hasAccess) {
        await userAPI.markLessonOpened(courseId, lessonId);
        const status = await userAPI.getLessonStatus(courseId, lessonId);
        if (status) {
          setLessonState(status.state);
          if (status.state === 'completed') {
            completedRef.current = true; // don't re-fire completion
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lesson');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      await userAPI.upgradeToPremium();
      Alert.alert(
        'Upgrade Successful! 🎉',
        'You now have access to all premium content. Enjoy!',
        [{ text: 'Continue', onPress: () => loadLesson() }]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to upgrade. Please try again.');
    }
  };

  // ─── Mini-player callbacks (must be above early returns for Rules of Hooks) ──
  const handleVideoPlay = useCallback((videoId: string, _yOffset: number, playerRef: React.RefObject<YoutubeIframeRef | null>) => {
    setFloatingVideoId(videoId);
    setVideoBlockY(scrollOffsetRef.current);
    setFloatingPlaying(true);
    setFloatingDismissed(false);
    setShowMiniPlayer(false);
    shouldResumeInlineRef.current = true;
    resumingInlineVideoRef.current = null;
    setInlinePlayingVideoId(videoId);
    activePlayerRef.current = playerRef.current;
  }, []);

  const handleVideoStateChange = useCallback((
    videoId: string,
    state: string,
    source: 'inline' | 'mini' = 'inline',
  ) => {
    if (state === 'playing') {
      setFloatingPlaying(true);
      if (source === 'inline') {
        if (resumingInlineVideoRef.current === videoId) {
          resumingInlineVideoRef.current = null;
          if (resumeInlineTimeoutRef.current) {
            clearTimeout(resumeInlineTimeoutRef.current);
            resumeInlineTimeoutRef.current = null;
          }
        }
        setInlinePlayingVideoId(videoId);
      } else {
        shouldResumeInlineRef.current = true;
        setInlinePlayingVideoId(null);
      }
      return;
    }

    if (state === 'ended') {
      setFloatingPlaying(false);
      setShowMiniPlayer(false);
      setMiniPlayerPlaying(false);
      shouldResumeInlineRef.current = false;
      if (source === 'inline') {
        resumingInlineVideoRef.current = null;
        setInlinePlayingVideoId(null);
      }
      return;
    }

    if (state === 'paused') {
      // During handoff, inline is intentionally paused after mini starts.
      if (source === 'inline' && showMiniPlayer) return;
      if (source === 'inline' && resumingInlineVideoRef.current === videoId) return;

      setFloatingPlaying(false);

      // Keep mini visible when user pauses it; only hide when inline is paused.
      if (source === 'inline') {
        shouldResumeInlineRef.current = false;
        resumingInlineVideoRef.current = null;
        setInlinePlayingVideoId(null);
        setShowMiniPlayer(false);
      } else {
        setMiniPlayerPlaying(false);
      }
    }
  }, [showMiniPlayer]);

  const dismissMiniPlayer = useCallback(() => {
    setFloatingDismissed(true);
    setFloatingVideoId(null);
    setShowMiniPlayer(false);
    setMiniPlayerPlaying(false);
    shouldResumeInlineRef.current = false;
    resumingInlineVideoRef.current = null;
    setInlinePlayingVideoId(null);
  }, [floatingVideoId]);

  const scrollToVideo = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: Math.max(0, videoBlockY - 10), animated: true });
  }, [videoBlockY]);

  useEffect(() => {
    let cancelled = false;

    const syncAndStartMiniPlayer = async () => {
      if (!showMiniPlayer || !floatingVideoId) {
        setMiniPlayerPlaying(false);
        return;
      }

      shouldResumeInlineRef.current = true;
      setMiniPlayerPlaying(false);
      setInlinePlayingVideoId(null);

      try {
        const currentTime = await activePlayerRef.current?.getCurrentTime?.();
        if (!cancelled && typeof currentTime === 'number' && !Number.isNaN(currentTime)) {
          setFloatingSeekTime(currentTime);
        }
      } catch {
        // Best effort: fallback to current stored seek time.
      }

      if (!cancelled) {
        setMiniPlayerPlaying(true);
      }
    };

    syncAndStartMiniPlayer();

    return () => {
      cancelled = true;
    };
  }, [showMiniPlayer, floatingVideoId]);

  const handleFlashcardsCompleted = useCallback(({ source }: { source?: RewardAnimationRect }) => {
    void (async () => {
      let result: RewardMutationResult;
      try {
        result = await userAPI.markFlashcardsCompleted(courseId, lessonId);
      } catch (error) {
        console.warn('[LessonScreen] Failed to persist flashcards reward', error);
        return;
      }

      if (result.xpAwarded > 0) {
        emitRewardAnimation({
          eventId: `anim:${courseId}:${lessonId}:flashcards`,
          type: 'xp',
          source,
          xpDelta: result.xpAwarded,
          tokenVariant: 'flashcards-image',
        });
        showRewardToast({
          kind: 'xp',
          message: `+${result.xpAwarded} XP earned`,
        });
      }

      result.badgeIdsEarned.forEach((badgeId) => {
        emitRewardAnimation({
          eventId: `anim:${courseId}:${lessonId}:badge:${badgeId}`,
          type: 'badge',
          badgeId,
          source,
        });
        showRewardToast({
          kind: 'badge',
          message: `Badge unlocked: ${formatBadgeTitle(badgeId)}`,
        });
      });

      result.certificateIdsIssued.forEach((certificateId) => {
        emitRewardAnimation({
          eventId: `anim:${courseId}:${lessonId}:certificate:${certificateId}`,
          type: 'certificate',
          source,
        });
        showRewardToast({
          kind: 'certificate',
          message: 'Certificate unlocked',
        });
      });
    })();
  }, [courseId, lessonId, emitRewardAnimation, showRewardToast, userAPI]);

  const handleQuizCompleted = useCallback(({
    score,
    totalQuestions,
    source,
  }: {
    score: number;
    totalQuestions: number;
    source?: RewardAnimationRect;
  }) => {
    void (async () => {
      let result: RewardMutationResult;
      try {
        result = await userAPI.markQuizCompleted(courseId, lessonId, score, totalQuestions);
      } catch (error) {
        console.warn('[LessonScreen] Failed to persist quiz reward', error);
        return;
      }

      if (result.xpAwarded > 0) {
        emitRewardAnimation({
          eventId: `anim:${courseId}:${lessonId}:quiz`,
          type: 'xp',
          source,
          xpDelta: result.xpAwarded,
        });
        showRewardToast({
          kind: 'xp',
          message: `+${result.xpAwarded} XP earned`,
        });
      }

      result.badgeIdsEarned.forEach((badgeId) => {
        emitRewardAnimation({
          eventId: `anim:${courseId}:${lessonId}:badge:${badgeId}`,
          type: 'badge',
          badgeId,
          source,
        });
        showRewardToast({
          kind: 'badge',
          message: `Badge unlocked: ${formatBadgeTitle(badgeId)}`,
        });
      });

      result.certificateIdsIssued.forEach((certificateId) => {
        emitRewardAnimation({
          eventId: `anim:${courseId}:${lessonId}:certificate:${certificateId}`,
          type: 'certificate',
          source,
        });
        showRewardToast({
          kind: 'certificate',
          message: 'Certificate unlocked',
        });
      });
    })();
  }, [courseId, lessonId, emitRewardAnimation, showRewardToast, userAPI]);

  if (loading) {
    return (
      <View flex={1} justifyContent="center" alignItems="center" backgroundColor="white">
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  if (error || !lesson) {
    return (
      <View flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="#EF4444">{error}</Text>
      </View>
    );
  }

  // Show paywall if user doesn't have access to premium lesson
  if (!canAccess) {
    return (
      <LockedLessonScreen
        lessonTitle={lesson.title}
        courseTitle={courseDetail?.title || 'Course'}
        onUpgrade={handleUpgrade}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
      >
      {/* Lesson Header */}
      <YStack marginBottom="$6" gap="$2">
        <Text fontSize={12} color="#6B7280" fontWeight="700" textTransform="uppercase" letterSpacing={1}>
          LESSON {lesson.order}
        </Text>
        <Text
          fontSize={28}
          fontWeight="800"
          color="#111827"
          lineHeight={34}
          style={nativeLessonTitleFontFamily ? { fontFamily: nativeLessonTitleFontFamily } : undefined}
        >
          {lesson.title}
        </Text>
        <XStack gap="$3" marginTop="$1" alignItems="center">
           <XStack alignItems="center" gap="$1.5">
            <Feather name="clock" size={14} color="#6B7280" />
            <Text fontSize={14} color="#6B7280">{lesson.estimatedDurationMinutes} min read</Text>
           </XStack>
           {lessonState === 'in-progress' && (
             <XStack alignItems="center" gap="$1.5" backgroundColor="#F0FDFA" paddingHorizontal="$2" paddingVertical="$1" borderRadius={12}>
               <Feather name="play-circle" size={13} color="#0D9488" />
               <Text fontSize={12} fontWeight="600" color="#0D9488">In Progress</Text>
             </XStack>
           )}
           {lessonState === 'completed' && (
             <XStack alignItems="center" gap="$1.5" backgroundColor="#F0FDFA" paddingHorizontal="$2" paddingVertical="$1" borderRadius={12}>
               <Feather name="check-circle" size={13} color="#0D9488" />
               <Text fontSize={12} fontWeight="600" color="#0D9488">Complete</Text>
             </XStack>
           )}
        </XStack>
      </YStack>

      <YStack gap="$5">
        {lesson.blocks.map((block, index) => (
          <BlockRenderer
            key={block.id || index}
            block={block}
            courseDetail={courseDetail}
            onFlashcardsCompleted={handleFlashcardsCompleted}
            onQuizCompleted={handleQuizCompleted}
            onVideoPlay={handleVideoPlay}
            onVideoStateChange={handleVideoStateChange}
            inlinePlayingVideoId={inlinePlayingVideoId}
            resumeInlineToken={resumeInlineToken}
            resumeInlineVideoId={resumeInlineVideoId}
            resumeInlineSeekTime={resumeInlineSeekTime}
          />
        ))}
      </YStack>
    </ScrollView>

    {/* Floating mini-player */}
    {showMiniPlayer && floatingVideoId && (
      <View style={miniPlayerStyles.container}>
        <TouchableOpacity
          style={miniPlayerStyles.playerTouchable}
          activeOpacity={0.9}
          onPress={scrollToVideo}
        >
          <View style={miniPlayerStyles.player}>
            <YoutubePlayer
              ref={miniPlayerRef}
              height={MINI_PLAYER_HEIGHT}
              videoId={floatingVideoId}
              play={miniPlayerPlaying}
              onReady={async () => {
                try {
                  if (floatingSeekTime > 0) {
                    await miniPlayerRef.current?.seekTo(floatingSeekTime, true);
                  }
                } catch {
                  // Ignore playback/seek failures.
                }
              }}
              onChangeState={(state) => {
                handleVideoStateChange(floatingVideoId, state, 'mini');
              }}
              webViewStyle={{ opacity: 0.99 }}
            />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={miniPlayerStyles.closeButton}
          onPress={dismissMiniPlayer}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="x" size={14} color="white" />
        </TouchableOpacity>
      </View>
    )}
    </View>
  );
}

function BlockRenderer({ block, courseDetail, onFlashcardsCompleted, onQuizCompleted, onVideoPlay, onVideoStateChange, inlinePlayingVideoId, resumeInlineToken, resumeInlineVideoId, resumeInlineSeekTime }: {
  block: ContentBlock;
  courseDetail: CourseDetail | null;
  onFlashcardsCompleted?: (payload: { source?: RewardAnimationRect }) => void;
  onQuizCompleted?: (payload: {
    score: number;
    totalQuestions: number;
    source?: RewardAnimationRect;
  }) => void;
  onVideoPlay?: (videoId: string, yOffset: number, playerRef: React.RefObject<YoutubeIframeRef | null>) => void;
  onVideoStateChange?: (videoId: string, state: string) => void;
  inlinePlayingVideoId?: string | null;
  resumeInlineToken?: number;
  resumeInlineVideoId?: string | null;
  resumeInlineSeekTime?: number;
}) {
  switch (block.type) {
    case 'heading':
      return (
        <Text 
          fontSize={block.level === 1 ? 24 : block.level === 2 ? 20 : 18} 
          fontWeight="700" 
          color="#111827"
          marginTop="$2"
          style={nativeHeadingFontFamily ? { fontFamily: nativeHeadingFontFamily } : undefined}
        >
          {block.text}
        </Text>
      );
    
    case 'text':
      return (
        <Text fontSize={16} lineHeight={26} color="#374151">
          {block.content.map((span, i) => (
            <Text 
              key={i} 
              fontWeight={span.bold ? '700' : '400'} 
              fontStyle={span.italic ? 'italic' : 'normal'}
              color={span.link ? '#2563EB' : '#374151'}
            >
              {span.text}
            </Text>
          ))}
        </Text>
      );

    case 'callout':
      const colors = {
        tip: { bg: '#F0FDFA', border: '#99F6E4', icon: '#0D9488', iconName: 'info' },
        warning: { bg: '#FFFBEB', border: '#FDE68A', icon: '#D97706', iconName: 'alert-triangle' },
        exam: { bg: '#FDF2F8', border: '#FBCFE8', icon: '#DB2777', iconName: 'bookmark' },
        success: { bg: '#F0FDFA', border: '#99F6E4', icon: '#0D9488', iconName: 'check-circle' },
        info: { bg: '#F1F5F9', border: '#E2E8F0', icon: '#64748B', iconName: 'info' }
      };
      const theme = colors[block.variant] || colors.info;

      return (
        <XStack 
          backgroundColor={theme.bg} 
          padding="$4" 
          borderRadius={8} 
          borderWidth={1} 
          borderColor={theme.border}
          gap="$3"
        >
          <Feather name={theme.iconName as any} size={20} color={theme.icon} />
          <Text flex={1} fontSize={15} color="#374151" lineHeight={22}>
            {block.text}
          </Text>
        </XStack>
      );

    case 'list':
      return (
        <YStack gap="$2" paddingLeft="$2">
          {block.items.map((item, i) => {
            // Handle both rich text (array) and plain text (string) formats
            const content = Array.isArray(item) 
              ? item.map((span, j) => (
                  <Text 
                    key={j} 
                    fontWeight={span.bold ? '700' : '400'} 
                    fontStyle={span.italic ? 'italic' : 'normal'}
                    color={span.link ? '#2563EB' : '#374151'}
                  >
                    {span.text}
                  </Text>
                ))
              : item;
            
            return (
              <XStack key={i} gap="$3" alignItems="flex-start">
                <Text color="#4B5563" fontWeight="700" fontSize={16} lineHeight={24}>•</Text>
                <Text flex={1} fontSize={16} lineHeight={24} color="#374151">
                  {content}
                </Text>
              </XStack>
            );
          })}
        </YStack>
      );
    
    case 'image':
      const imageBlock = block as any;
      const imageSource = typeof imageBlock.src === 'string'
        ? {
            uri: buildVersionedImageUri(
              imageBlock.src,
              imageBlock.version,
              imageBlock.hash,
            ),
          }
        : imageBlock.src;

      return (
        <LessonImage source={imageSource} caption={imageBlock.caption} />
      );

    case 'video':
      if (block.provider === 'youtube' && block.videoId) {
        return (
          <VideoBlock
            videoId={block.videoId}
            title={block.title}
            onVideoPlay={onVideoPlay}
            onVideoStateChange={onVideoStateChange}
            shouldPlay={inlinePlayingVideoId === block.videoId}
            resumeInlineToken={resumeInlineToken}
            resumeInlineVideoId={resumeInlineVideoId}
            resumeInlineSeekTime={resumeInlineSeekTime}
          />
        );
      }
      // Fallback for other video types
      return (
        <View height={200} backgroundColor="#1F2937" borderRadius={8} justifyContent="center" alignItems="center">
          <Feather name="play-circle" size={48} color="white" opacity={0.8} />
          <Text color="white" marginTop="$2" fontSize={12} opacity={0.8}>Video: {block.title}</Text>
        </View>
      );

    case 'quiz':
      if (!courseDetail?.quizzes) return null;
      const quiz = courseDetail.quizzes.find(q => q.quizId === block.quizId);
      if (!quiz) return null;
      return <QuizBlock quiz={quiz} onCompleted={onQuizCompleted} />;

    case 'flashcards':
      if (!block.cards || block.cards.length === 0) return null;
      return <FlashcardsBlock cards={block.cards} onCompleted={onFlashcardsCompleted} />;

    default:
      return null;
  }
}

/** Renders a lesson image at its natural aspect ratio (no cropping). */
function LessonImage({ source, caption }: { source: ImageSourcePropType; caption?: string }) {
  const [aspectRatio, setAspectRatio] = useState(16 / 9); // fallback

  useEffect(() => {
    if (typeof source === 'number') {
      const resolved = Image.resolveAssetSource(source);
      if (resolved?.width && resolved?.height) {
        setAspectRatio(resolved.width / resolved.height);
      }
      return;
    }

    if (source && typeof source === 'object' && 'uri' in source) {
      const uri = source.uri;
      if (typeof uri !== 'string' || uri.length === 0) return;
      Image.getSize(
        uri,
        (w, h) => { if (w && h) setAspectRatio(w / h); },
        () => {},  // keep fallback on error
      );
    }
  }, [source]);

  return (
    <View marginVertical="$2" width="100%">
      <View
        width="100%"
        borderRadius={12}
        overflow="hidden"
        backgroundColor="#E5E7EB"
        shadowColor="#000"
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={0.08}
        shadowRadius={8}
      >
        <Image
          source={source}
          style={{ width: '100%', aspectRatio }}
          resizeMode="contain"
        />
      </View>
      {caption ? (
        <Text fontSize={13} color="#6B7280" marginTop="$2.5" textAlign="center" fontStyle="italic" lineHeight={20}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** YouTube video block — tracks play state and reports to parent for mini-player. */
function VideoBlock({ videoId, title, onVideoPlay, onVideoStateChange, shouldPlay, resumeInlineToken, resumeInlineVideoId, resumeInlineSeekTime }: {
  videoId: string;
  title?: string;
  onVideoPlay?: (videoId: string, yOffset: number, playerRef: React.RefObject<YoutubeIframeRef | null>) => void;
  onVideoStateChange?: (videoId: string, state: string) => void;
  shouldPlay?: boolean;
  resumeInlineToken?: number;
  resumeInlineVideoId?: string | null;
  resumeInlineSeekTime?: number;
}) {
  const playerRef = useRef<YoutubeIframeRef>(null);
  const pendingResumeSeekRef = useRef<number | null>(null);
  const pendingResumePlayRef = useRef(false);
  const [playerInstanceKey, setPlayerInstanceKey] = useState(0);
  const videoHeight = Math.round((Dimensions.get('window').width - 40) * 9 / 16);

  const handleStateChange = useCallback((state: string) => {
    if (state === 'playing') {
      onVideoPlay?.(videoId, 0, playerRef as React.RefObject<YoutubeIframeRef | null>);
    }
    onVideoStateChange?.(videoId, state);
  }, [videoId, onVideoPlay, onVideoStateChange, shouldPlay]);

  useEffect(() => {
    if (!resumeInlineToken || resumeInlineVideoId !== videoId) return;
    pendingResumeSeekRef.current =
      typeof resumeInlineSeekTime === 'number' && resumeInlineSeekTime > 0
        ? resumeInlineSeekTime
        : null;
    pendingResumePlayRef.current = true;
    setPlayerInstanceKey((k) => k + 1);
  }, [resumeInlineToken, resumeInlineVideoId, resumeInlineSeekTime, videoId]);

  return (
    <View marginVertical="$2" width="100%">
      <View
        width="100%"
        aspectRatio={16 / 9}
        borderRadius={12}
        overflow="hidden"
        backgroundColor="#000"
        shadowColor="#000"
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={0.1}
        shadowRadius={8}
      >
        <YoutubePlayer
          key={`${videoId}-${playerInstanceKey}`}
          ref={playerRef}
          height={videoHeight}
          videoId={videoId}
          play={!!shouldPlay}
          onReady={async () => {
            if (!pendingResumePlayRef.current) return;
            try {
              const pendingSeek = pendingResumeSeekRef.current;
              if (typeof pendingSeek === 'number' && pendingSeek > 0) {
                await playerRef.current?.seekTo(pendingSeek, true);
              }
              await (playerRef.current as any)?.playVideo?.();
            } catch {
            } finally {
              pendingResumePlayRef.current = false;
              pendingResumeSeekRef.current = null;
            }
          }}
          onChangeState={handleStateChange}
          webViewStyle={{ opacity: 0.99 }}
        />
      </View>
      {title && (
        <Text fontSize={13} color="#6B7280" marginTop="$2" textAlign="center" fontStyle="italic">
          {title}
        </Text>
      )}
    </View>
  );
}

const MINI_PLAYER_WIDTH = 180;
const MINI_PLAYER_HEIGHT = Math.round(MINI_PLAYER_WIDTH * 9 / 16);

const miniPlayerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  playerTouchable: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  player: {
    width: MINI_PLAYER_WIDTH,
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
});
