import React, { useState } from 'react';
import { TouchableOpacity, Animated, Platform } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { Feather } from '@expo/vector-icons';

interface FlashcardsBlockProps {
  cards: Array<{
    front: string;
    back: string;
  }>;
}

export function FlashcardsBlock({ cards }: FlashcardsBlockProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flipAnim] = useState(new Animated.Value(0));
  const isNative = Platform.OS !== 'web';
  const blockPadding = isNative ? '$4' : '$5';
  const cardHeight = isNative ? 220 : 280;
  const cardTextSize = isNative ? 18 : 22;
  const cardTextLineHeight = isNative ? 27 : 32;

  const currentCard = cards[currentCardIndex];
  const totalCards = cards.length;

  const handleFlip = () => {
    const toValue = isFlipped ? 0 : 1;
    
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    if (currentCardIndex < totalCards - 1) {
      setCurrentCardIndex(prev => prev + 1);
      setIsFlipped(false);
      flipAnim.setValue(0);
    }
  };

  const handlePrevious = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(prev => prev - 1);
      setIsFlipped(false);
      flipAnim.setValue(0);
    }
  };

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <YStack
      backgroundColor="white"
      borderRadius={16}
      padding={blockPadding}
      borderWidth={1}
      borderColor="#E5E7EB"
      shadowColor="#000"
      shadowOffset={{ width: 0, height: 1 }}
      shadowOpacity={0.05}
      shadowRadius={2}
      gap="$3"
    >
      {/* Flashcard Header */}
      <YStack gap="$3">
        <XStack alignItems="center" gap="$3" backgroundColor="#F8FAFC" borderRadius={12} padding="$2.5" borderWidth={1} borderColor="#E5E7EB">
          <View
            backgroundColor="#0D9488"
            width={40}
            height={40}
            borderRadius={20}
            justifyContent="center"
            alignItems="center"
          >
            <Feather name="layers" size={24} color="white" />
          </View>
          <YStack flex={1} minWidth={0}>
            <Text fontSize={18} fontWeight="700" color="#111827">
              Flashcards
            </Text>
            <Text fontSize={13} color="#6B7280" fontWeight="500">
              Card {currentCardIndex + 1} of {totalCards}
            </Text>
          </YStack>
        </XStack>
      
        {/* Progress Bar */}
        <View width="100%" height={4} backgroundColor="#E5E7EB" borderRadius={2}>
          <View
            width={`${((currentCardIndex + 1) / totalCards) * 100}%`}
            height="100%"
            backgroundColor="#0D9488"
            borderRadius={2}
          />
        </View>
      </YStack>

      {/* Flashcard */}
      <TouchableOpacity onPress={handleFlip} activeOpacity={0.9}>
        <View
          height={cardHeight}
          position="relative"
          style={{
            perspective: 1000,
          }}
        >
          {/* Front of card */}
          <Animated.View
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: [{ rotateY: frontInterpolate }],
              opacity: frontOpacity,
            }}
          >
            <View
              backgroundColor="white"
              height="100%"
              borderRadius={16}
              padding={isNative ? '$4' : '$6'}
              justifyContent="center"
              alignItems="center"
              borderWidth={1}
              borderColor="#E5E7EB"
              shadowColor="#000"
              shadowOffset={{ width: 0, height: 4 }}
              shadowOpacity={0.1}
              shadowRadius={12}
            >
              <Text
                fontSize={cardTextSize}
                fontWeight="700"
                color="#111827"
                textAlign="center"
                lineHeight={cardTextLineHeight}
              >
                {currentCard.front}
              </Text>
              <XStack
                position="absolute"
                bottom={20}
                alignItems="center"
                gap="$2"
                backgroundColor="#F3F4F6"
                paddingHorizontal="$3"
                paddingVertical="$1.5"
                borderRadius={20}
              >
                <Feather name="rotate-cw" size={12} color="#6B7280" />
                <Text fontSize={12} color="#6B7280" fontWeight="600">
                  Tap to flip
                </Text>
              </XStack>
            </View>
          </Animated.View>

          {/* Back of card */}
          <Animated.View
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: [{ rotateY: backInterpolate }],
              opacity: backOpacity,
            }}
          >
            <View
              backgroundColor="#0D9488"
              height="100%"
              borderRadius={16}
              padding={isNative ? '$4' : '$6'}
              justifyContent="center"
              alignItems="center"
              shadowColor="#0D9488"
              shadowOffset={{ width: 0, height: 8 }}
              shadowOpacity={0.3}
              shadowRadius={16}
            >
              <Text
                fontSize={isNative ? 17 : 20}
                fontWeight="600"
                color="white"
                textAlign="center"
                lineHeight={isNative ? 26 : 30}
              >
                {currentCard.back}
              </Text>
              <XStack
                position="absolute"
                bottom={20}
                alignItems="center"
                gap="$2"
                backgroundColor="rgba(255,255,255,0.2)"
                paddingHorizontal="$3"
                paddingVertical="$1.5"
                borderRadius={20}
              >
                <Feather name="rotate-ccw" size={12} color="white" />
                <Text fontSize={12} color="white" fontWeight="600">
                  Tap to flip back
                </Text>
              </XStack>
            </View>
          </Animated.View>
        </View>
      </TouchableOpacity>


      {/* Navigation */}
      <XStack justifyContent="space-between" marginTop="$1">
        <TouchableOpacity
          onPress={handlePrevious}
          disabled={currentCardIndex === 0}
          style={{ opacity: currentCardIndex === 0 ? 0.3 : 1 }}
        >
          <XStack
            backgroundColor="white"
            paddingHorizontal={isNative ? '$3' : '$4'}
            paddingVertical={isNative ? '$2' : '$2.5'}
            borderRadius={8}
            borderWidth={1}
            borderColor="#E5E7EB"
            gap="$2"
            alignItems="center"
          >
            <Feather name="chevron-left" size={18} color="#6B7280" />
            <Text fontSize={14} fontWeight="600" color="#6B7280">
              Previous
            </Text>
          </XStack>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNext}
          disabled={currentCardIndex === totalCards - 1}
          style={{ opacity: currentCardIndex === totalCards - 1 ? 0.3 : 1 }}
        >
          <XStack
            backgroundColor="white"
            paddingHorizontal={isNative ? '$3' : '$4'}
            paddingVertical={isNative ? '$2' : '$2.5'}
            borderRadius={8}
            borderWidth={1}
            borderColor="#E5E7EB"
            gap="$2"
            alignItems="center"
          >
            <Text fontSize={14} fontWeight="600" color="#6B7280">
              Next
            </Text>
            <Feather name="chevron-right" size={18} color="#6B7280" />
          </XStack>
        </TouchableOpacity>
      </XStack>

      {/* Completion indicator */}
      {currentCardIndex === totalCards - 1 && isFlipped && (
        <XStack
          backgroundColor="#F0FDFA"
          padding="$3"
          borderRadius={10}
          borderWidth={1}
          borderColor="#99F6E4"
          gap="$2.5"
          alignItems="center"
          justifyContent="center"
        >
          <Feather name="check-circle" size={18} color="#0D9488" />
          <Text fontSize={14} fontWeight="600" color="#134E4A">
            You've reviewed all {totalCards} cards!
          </Text>
        </XStack>
      )}
    </YStack>
  );
}
