import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TouchableOpacity, TextInput, Platform, View as RNView } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { Feather } from '@expo/vector-icons';
import { Quiz, QuizQuestion } from '../../api/course/CourseAPI';
import type { RewardCelebrateRect } from '../../context/RewardCelebrateContext';

interface QuizBlockProps {
  quiz: Quiz;
  onCompleted?: (payload: {
    score: number;
    totalQuestions: number;
    source?: RewardCelebrateRect;
  }) => void;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isQuestionCorrect(question: QuizQuestion, userAnswer: any): boolean {
  if (userAnswer === undefined || userAnswer === null) return false;

  if (question.type === 'short_answer') {
    const expected = Array.isArray(question.correctAnswer)
      ? question.correctAnswer.map((v) => normalizeText(String(v)))
      : [normalizeText(String(question.correctAnswer))];
    return expected.includes(normalizeText(String(userAnswer)));
  }

  return userAnswer === question.correctAnswer;
}

function computeQuizScore(quiz: Quiz, selectedAnswers: Record<string, any>) {
  const totalQuestions = quiz.questions.length;
  if (totalQuestions === 0) return 0;

  let correctCount = 0;
  for (const question of quiz.questions) {
    const userAnswer = selectedAnswers[question.questionId];
    if (isQuestionCorrect(question, userAnswer)) {
      correctCount += 1;
    }
  }
  return Math.round((correctCount / totalQuestions) * 100);
}

export function QuizBlock({ quiz, onCompleted }: QuizBlockProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, any>>({});
  const [showExplanation, setShowExplanation] = useState<Record<string, boolean>>({});
  const rootRef = useRef<RNView>(null);
  const completionNotifiedRef = useRef(false);
  const isNative = Platform.OS !== 'web';
  const blockPadding = isNative ? '$4' : '$5';

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const totalQuestions = quiz.questions.length;
  const isQuizCompleted = useMemo(
    () => Object.keys(selectedAnswers).length === totalQuestions && totalQuestions > 0,
    [selectedAnswers, totalQuestions],
  );

  useEffect(() => {
    if (!isQuizCompleted) return;
    if (completionNotifiedRef.current) return;

    completionNotifiedRef.current = true;
    const score = computeQuizScore(quiz, selectedAnswers);
    requestAnimationFrame(() => {
      rootRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          onCompleted?.({
            score,
            totalQuestions,
            source: { x, y, width, height },
          });
          return;
        }
        onCompleted?.({ score, totalQuestions });
      });
    });
  }, [isQuizCompleted, onCompleted, quiz, selectedAnswers, totalQuestions]);

  const handleAnswerSelect = (questionId: string, answer: any) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: answer }));
    setShowExplanation(prev => ({ ...prev, [questionId]: true }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const isAnswered = selectedAnswers[currentQuestion.questionId] !== undefined;
  const userAnswer = selectedAnswers[currentQuestion.questionId];
  const showCurrentExplanation = showExplanation[currentQuestion.questionId];

  return (
    <RNView ref={rootRef} collapsable={false}>
      <YStack
      width="100%"
      maxWidth="100%"
      backgroundColor="white"
      borderRadius={16}
      padding={blockPadding}
      borderWidth={1}
      borderColor="#E5E7EB"
      overflow="hidden"
      shadowColor="#000"
      shadowOffset={{ width: 0, height: 1 }}
      shadowOpacity={0.05}
      shadowRadius={2}
      gap="$3"
    >
      {/* Quiz Header */}
      <YStack gap="$4" width="100%" minWidth={0}>
        <XStack alignItems="center" gap="$3" width="100%" backgroundColor="#F8FAFC" borderRadius={12} padding="$2.5" borderWidth={1} borderColor="#E5E7EB">
          <View
            backgroundColor="#0D9488"
            width={40}
            height={40}
            borderRadius={20}
            justifyContent="center"
            alignItems="center"
          >
            <Feather name="help-circle" size={24} color="white" />
          </View>
          <YStack flex={1} minWidth={0} maxWidth="100%">
            <Text fontSize={18} fontWeight="700" color="#111827" flexShrink={1}>
              {quiz.title}
            </Text>
            <Text
              fontSize={13}
              color="#6B7280"
              fontWeight="500"
              flexShrink={1}
              maxWidth="100%"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </Text>
          </YStack>
        </XStack>

        {/* Progress Bar (Separator Line style) */}
        <View width="100%" height={4} backgroundColor="#E5E7EB" borderRadius={2}>
          <View
            width={`${((currentQuestionIndex + 1) / totalQuestions) * 100}%`}
            height="100%"
            backgroundColor="#0D9488"
            borderRadius={2}
          />
        </View>
      </YStack>

      {/* Question */}
      <QuestionRenderer
        question={currentQuestion}
        selectedAnswer={userAnswer}
        showExplanation={showCurrentExplanation}
        onAnswerSelect={(answer) => handleAnswerSelect(currentQuestion.questionId, answer)}
      />

      {/* Navigation */}
      <XStack justifyContent="space-between" marginTop="$1">
        <TouchableOpacity
          onPress={handlePrevious}
          disabled={currentQuestionIndex === 0}
          style={{ opacity: currentQuestionIndex === 0 ? 0.3 : 1 }}
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
          disabled={currentQuestionIndex === totalQuestions - 1}
          style={{ opacity: currentQuestionIndex === totalQuestions - 1 ? 0.3 : 1 }}
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
      </YStack>
    </RNView>
  );
}

interface QuestionRendererProps {
  question: QuizQuestion;
  selectedAnswer: any;
  showExplanation: boolean;
  onAnswerSelect: (answer: any) => void;
}

function QuestionRenderer({ question, selectedAnswer, showExplanation, onAnswerSelect }: QuestionRendererProps) {
  switch (question.type) {
    case 'mcq':
      return <MCQQuestion question={question} selectedAnswer={selectedAnswer} showExplanation={showExplanation} onAnswerSelect={onAnswerSelect} />;
    case 'true_false':
      return <TrueFalseQuestion question={question} selectedAnswer={selectedAnswer} showExplanation={showExplanation} onAnswerSelect={onAnswerSelect} />;
    case 'short_answer':
      return <ShortAnswerQuestion question={question} selectedAnswer={selectedAnswer} showExplanation={showExplanation} onAnswerSelect={onAnswerSelect} />;
    default:
      return null;
  }
}

function MCQQuestion({ question, selectedAnswer, showExplanation, onAnswerSelect }: QuestionRendererProps) {
  const isNative = Platform.OS !== 'web';
  return (
    <YStack gap={isNative ? '$3' : '$4'}>
      <Text fontSize={isNative ? 17 : 18} fontWeight="600" color="#111827" lineHeight={isNative ? 26 : 28} flexShrink={1}>
        {question.prompt}
      </Text>

      <YStack gap={isNative ? '$2.5' : '$3'}>
        {question.choices?.map((choice, index) => {
          const isSelected = selectedAnswer === choice;
          const isCorrect = choice === question.correctAnswer;
          
          let borderColor = '#E5E7EB';
          let backgroundColor = 'white';
          let radioColors = { border: '#D1D5DB', bg: 'white', inner: 'transparent' };

          if (showExplanation && isSelected) {
             // ... existing logic mostly, but let's conform to visual style ...
             // Actually, for professional look, we might want to keep it cleaner
             if (isCorrect) {
                 borderColor = '#0D9488';
                 backgroundColor = '#F0FDFA';
                 radioColors = { border: '#0D9488', bg: '#0D9488', inner: 'white' };
             } else {
                 borderColor = '#EF4444';
                 backgroundColor = '#FEF2F2';
                 radioColors = { border: '#EF4444', bg: '#EF4444', inner: 'white' };
             }
          } else if (isSelected) {
            borderColor = '#0D9488';
            backgroundColor = '#F0FDFA'; // Very light teal
            radioColors = { border: '#0D9488', bg: '#0D9488', inner: 'white' };
          }

          return (
            <TouchableOpacity key={index} onPress={() => !showExplanation && onAnswerSelect(choice)} activeOpacity={0.7}>
              <XStack
                backgroundColor={backgroundColor}
                padding={isNative ? '$3' : '$4'}
                borderRadius={12}
                borderWidth={1}
                borderColor={borderColor}
                gap="$3"
                alignItems="center"
                minWidth={0}
                 shadowColor="#000"
                 shadowOffset={{width: 0, height: 1}}
                 shadowOpacity={0.02}
                 shadowRadius={2}
              >
                {/* Radio Button */}
                <View
                  width={24}
                  height={24}
                  borderRadius={12}
                  borderWidth={isSelected ? 6 : 1} // Thick border for selected state to mimic radio dot
                  borderColor={radioColors.border}
                  backgroundColor={isSelected ? radioColors.border : 'white'} 
                  justifyContent="center"
                  alignItems="center"
                />
                
                <Text flex={1} minWidth={0} flexShrink={1} fontSize={isNative ? 15 : 16} color="#374151" lineHeight={isNative ? 22 : 24}>
                  {choice}
                </Text>
                
                {showExplanation && isSelected && (
                  <Feather 
                    name={isCorrect ? "check-circle" : "x-circle"} 
                    size={20} 
                    color={isCorrect ? "#0D9488" : "#EF4444"} 
                  />
                )}
              </XStack>
            </TouchableOpacity>
          );
        })}
      </YStack>

      {showExplanation && (
        <XStack
          backgroundColor="#F0FDFA"
          padding="$3.5"
          borderRadius={10}
          borderWidth={1}
          borderColor="#99F6E4"
          gap="$2.5"
          marginTop="$1"
        >
          <Feather name="info" size={18} color="#0D9488" style={{ marginTop: 2 }} />
          <Text flex={1} fontSize={14} color="#134E4A" lineHeight={21}>
            {question.explanation}
          </Text>
        </XStack>
      )}
    </YStack>
  );
}

function TrueFalseQuestion({ question, selectedAnswer, showExplanation, onAnswerSelect }: QuestionRendererProps) {
  const isNative = Platform.OS !== 'web';
  const choices = [
    { label: 'True', value: true },
    { label: 'False', value: false }
  ];

  return (
    <YStack gap={isNative ? '$2.5' : '$3'}>
      <Text fontSize={isNative ? 16 : 17} fontWeight="600" color="#111827" lineHeight={isNative ? 24 : 26} flexShrink={1}>
        {question.prompt}
      </Text>

      <XStack gap="$2.5">
        {choices.map((choice) => {
          const isSelected = selectedAnswer === choice.value;
          const isCorrect = choice.value === question.correctAnswer;
          
          let borderColor = '#E5E7EB';
          let backgroundColor = 'white';
          let iconName: any = null;
          let iconColor = '';

          if (showExplanation && isSelected) {
            if (isCorrect) {
              borderColor = '#0D9488';
              backgroundColor = '#F0FDFA';
              iconName = 'check-circle';
              iconColor = '#0D9488';
            } else {
              borderColor = '#EF4444';
              backgroundColor = '#FEF2F2';
              iconName = 'x-circle';
              iconColor = '#EF4444';
            }
          } else if (isSelected) {
            borderColor = '#0D9488';
            backgroundColor = '#F0FDFA';
          }

          return (
            <TouchableOpacity key={choice.label} onPress={() => !showExplanation && onAnswerSelect(choice.value)} style={{ flex: 1 }}>
              <XStack
                flex={1}
                backgroundColor={backgroundColor}
                padding={isNative ? '$3' : '$4'}
                borderRadius={12}
                borderWidth={2}
                borderColor={borderColor}
                justifyContent="center"
                alignItems="center"
                gap="$2"
                minWidth={0}
              >
                <Text fontSize={isNative ? 15 : 16} fontWeight="600" color="#374151" flexShrink={1} textAlign="center">
                  {choice.label}
                </Text>
                {iconName && (
                  <Feather name={iconName} size={20} color={iconColor} />
                )}
              </XStack>
            </TouchableOpacity>
          );
        })}
      </XStack>

      {showExplanation && (
        <XStack
          backgroundColor="#F0FDFA"
          padding="$3.5"
          borderRadius={10}
          borderWidth={1}
          borderColor="#99F6E4"
          gap="$2.5"
          marginTop="$1"
        >
          <Feather name="info" size={18} color="#0D9488" style={{ marginTop: 2 }} />
          <Text flex={1} fontSize={14} color="#134E4A" lineHeight={21}>
            {question.explanation}
          </Text>
        </XStack>
      )}
    </YStack>
  );
}

function ShortAnswerQuestion({ question, selectedAnswer, showExplanation, onAnswerSelect }: QuestionRendererProps) {
  const isNative = Platform.OS !== 'web';
  const [inputValue, setInputValue] = useState(selectedAnswer || '');

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onAnswerSelect(inputValue.trim());
    }
  };

  return (
    <YStack gap={isNative ? '$2.5' : '$3'}>
      <Text fontSize={isNative ? 16 : 17} fontWeight="600" color="#111827" lineHeight={isNative ? 24 : 26} flexShrink={1}>
        {question.prompt}
      </Text>

      <YStack gap="$2">
        <TextInput
          value={inputValue}
          onChangeText={setInputValue}
          placeholder="Type your answer here..."
          placeholderTextColor="#9CA3AF"
          editable={!showExplanation}
          multiline
          numberOfLines={3}
          style={{
            backgroundColor: 'white',
            borderWidth: 2,
            borderColor: showExplanation ? '#0D9488' : '#E5E7EB',
            borderRadius: 12,
            padding: 14,
            fontSize: 15,
            color: '#374151',
            minHeight: 80,
            textAlignVertical: 'top',
          }}
        />

        {!showExplanation && (
          <TouchableOpacity onPress={handleSubmit} disabled={!inputValue.trim()}>
            <View
              backgroundColor={inputValue.trim() ? '#0D9488' : '#D1D5DB'}
              paddingVertical="$3"
              borderRadius={10}
              alignItems="center"
            >
              <Text fontSize={15} fontWeight="600" color="white">
                Submit Answer
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </YStack>

      {showExplanation && (
        <YStack gap="$2.5">
          <XStack
            backgroundColor="#F0FDFA"
            padding="$3.5"
            borderRadius={10}
            borderWidth={1}
            borderColor="#99F6E4"
            gap="$2.5"
          >
            <Feather name="check-circle" size={18} color="#0D9488" style={{ marginTop: 2 }} />
            <YStack flex={1} gap="$1.5">
              <Text fontSize={14} fontWeight="600" color="#134E4A">
                Acceptable answers:
              </Text>
              <Text fontSize={14} color="#134E4A" lineHeight={20}>
                {Array.isArray(question.correctAnswer) 
                  ? question.correctAnswer.join(', ') 
                  : question.correctAnswer.toString()}
              </Text>
            </YStack>
          </XStack>

          <XStack
            backgroundColor="#F0FDFA"
            padding="$3.5"
            borderRadius={10}
            borderWidth={1}
            borderColor="#99F6E4"
            gap="$2.5"
          >
            <Feather name="info" size={18} color="#0D9488" style={{ marginTop: 2 }} />
            <Text flex={1} fontSize={14} color="#134E4A" lineHeight={21}>
              {question.explanation}
            </Text>
          </XStack>
        </YStack>
      )}
    </YStack>
  );
}
