import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  DynamicColorIOS,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';

import LiveCameraScanner from './LiveCameraScanner';
import {
  analyzeImage,
  deleteTemporaryImage,
  type ImageAnalysisResult,
} from './imageAnalysis';
import {
  DEFAULT_PROMPT,
  loadRearview,
  loadSavedPrompt,
  savePrompt,
} from './rearview';

type ModelState = 'loading' | 'ready' | 'error';

const IMAGE_OPTIONS = {
  mediaType: 'photo' as const,
  maxWidth: 256,
  maxHeight: 256,
  quality: 0.5 as const,
};

const screenBackgroundColor = DynamicColorIOS({
  light: '#f2f2f7',
  dark: '#000000',
});
const cardBackgroundColor = DynamicColorIOS({
  light: '#ffffff',
  dark: '#1c1c1e',
});
const primaryTextColor = DynamicColorIOS({ light: '#111111', dark: '#f5f5f7' });
const secondaryTextColor = DynamicColorIOS({
  light: '#52525b',
  dark: '#c7c7cc',
});
const borderColor = DynamicColorIOS({ light: '#a1a1aa', dark: '#636366' });
const previewBackgroundColor = DynamicColorIOS({
  light: '#e5e5ea',
  dark: '#2c2c2e',
});
const accentColor = DynamicColorIOS({ light: '#0066cc', dark: '#64a8ff' });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function imagePickerError(response: ImagePickerResponse): Error | null {
  if (!response.errorCode) {
    return null;
  }

  return new Error(
    response.errorMessage ?? `Image picker error: ${response.errorCode}`,
  );
}

function cleanupTemporaryImage(path: string): void {
  deleteTemporaryImage(path).catch(error => {
    console.error(error);
  });
}

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState('Loading bundled model…');
  const [modelState, setModelState] = useState<ModelState>('loading');
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [savedPrompt, setSavedPrompt] = useState(DEFAULT_PROMPT);
  const [imageURI, setImageURI] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [resizeElapsed, setResizeElapsed] = useState<number | null>(null);
  const [imageDimensions, setImageDimensions] = useState<string | null>(null);
  const [timings, setTimings] = useState<unknown>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const temporaryImageRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function initialize(): Promise<void> {
      try {
        const storedPrompt = await loadSavedPrompt();

        if (!active) {
          return;
        }

        setPrompt(storedPrompt);
        setSavedPrompt(storedPrompt);

        await loadRearview(message => {
          if (active) {
            setStatus(message);
          }
        });

        if (active) {
          setModelState('ready');
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setModelState('error');
          setStatus(`Error: ${errorMessage(error)}`);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (temporaryImageRef.current !== null) {
        cleanupTemporaryImage(temporaryImageRef.current);
      }
    },
    [],
  );

  async function handleSavePrompt(): Promise<void> {
    setSavingPrompt(true);

    try {
      await savePrompt(prompt);
      setSavedPrompt(prompt);
      setStatus('Prompt saved locally');
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${errorMessage(error)}`);
    } finally {
      setSavingPrompt(false);
    }
  }

  const handleAnalysisResult = useCallback((result: ImageAnalysisResult) => {
    const previousImage = temporaryImageRef.current;
    temporaryImageRef.current = result.imageURI;

    if (previousImage !== null && previousImage !== result.imageURI) {
      cleanupTemporaryImage(previousImage);
    }

    setImageURI(result.imageURI);
    setImageDimensions(`${result.imageWidth} × ${result.imageHeight}`);
    setDescription(result.text);
    setElapsed(result.elapsedMilliseconds);
    setResizeElapsed(result.resizeMilliseconds);
    setTimings(result.timings);
  }, []);

  const handleCameraStatus = useCallback((nextStatus: string) => {
    setStatus(nextStatus);
  }, []);

  const handleCameraActiveChange = useCallback((active: boolean) => {
    setCameraActive(active);
  }, []);

  const handleCameraBusyChange = useCallback((busy: boolean) => {
    setAnalysisBusy(busy);
  }, []);

  async function chooseImage(): Promise<void> {
    try {
      const response = await launchImageLibrary({
        ...IMAGE_OPTIONS,
        selectionLimit: 1,
      });

      if (response.didCancel) {
        return;
      }

      const pickerError = imagePickerError(response);

      if (pickerError !== null) {
        throw pickerError;
      }

      const uri = response.assets?.[0]?.uri;

      if (!uri) {
        throw new Error('Image picker returned no image URI');
      }

      setImageURI(uri);
      setDescription('');
      setElapsed(null);
      setResizeElapsed(null);
      setImageDimensions(null);
      setTimings(null);
      setAnalysisBusy(true);
      setStatus('Analysing image…');

      const result = await analyzeImage(uri, prompt);

      handleAnalysisResult(result);
      setStatus('Analysis complete');
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${errorMessage(error)}`);
    } finally {
      setAnalysisBusy(false);
    }
  }

  const promptIsEmpty = prompt.trim() === '';
  const canAnalyze = modelState === 'ready' && !promptIsEmpty;

  return (
    <SafeAreaView
      edges={['top', 'right', 'bottom', 'left']}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {!cameraActive && (
          <>
            <Text style={styles.title}>Rearview</Text>

            <View style={styles.statusBox}>
              <Text selectable style={styles.statusText}>
                {status}
              </Text>
            </View>

            <View style={styles.promptBox}>
              <Text style={styles.fieldLabel}>Prompt</Text>
              <TextInput
                accessibilityLabel="Analysis prompt"
                multiline
                onChangeText={setPrompt}
                style={styles.promptInput}
                value={prompt}
              />
              <Button
                color={accentColor}
                title={savingPrompt ? 'Saving…' : 'Save prompt'}
                disabled={
                  savingPrompt || promptIsEmpty || prompt === savedPrompt
                }
                onPress={handleSavePrompt}
              />
            </View>
          </>
        )}

        <LiveCameraScanner
          canAnalyze={canAnalyze}
          onActiveChange={handleCameraActiveChange}
          onBusyChange={handleCameraBusyChange}
          onResult={handleAnalysisResult}
          onStatus={handleCameraStatus}
          prompt={prompt}
        />

        {!cameraActive && (
          <View style={styles.actions}>
            <Button
              color={accentColor}
              title={analysisBusy ? 'Working…' : 'Choose and analyse photo'}
              disabled={analysisBusy || !canAnalyze}
              onPress={chooseImage}
            />
          </View>
        )}

        {cameraActive && imageURI === null && (
          <View style={styles.previewPlaceholder}>
            <Text style={styles.statusText}>Waiting for first analysis…</Text>
          </View>
        )}

        {imageURI !== null && (
          <Image
            source={{ uri: imageURI }}
            style={styles.preview}
            resizeMode="contain"
          />
        )}

        {description !== '' && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Result</Text>
            <Text selectable style={styles.resultText}>
              {description}
            </Text>

            {elapsed !== null && (
              <Text selectable style={styles.timing}>
                Inference: {(elapsed / 1000).toFixed(3)} seconds
              </Text>
            )}
            {resizeElapsed !== null && imageDimensions !== null && (
              <Text selectable style={styles.timingDetail}>
                Input: {imageDimensions} · resize: {resizeElapsed} ms
              </Text>
            )}
          </View>
        )}

        {timings !== null && (
          <>
            <Button
              color={accentColor}
              onPress={() => setDetailsExpanded(expanded => !expanded)}
              title={detailsExpanded ? 'Hide diagnostics' : 'Show diagnostics'}
            />
            {detailsExpanded && (
              <View style={styles.timingBox}>
                <Text style={styles.resultTitle}>llama.cpp timings</Text>
                <Text selectable style={styles.monospace}>
                  {JSON.stringify(timings, null, 2)}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: screenBackgroundColor,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  title: {
    color: primaryTextColor,
    fontSize: 32,
    fontWeight: '700',
  },
  statusBox: {
    minHeight: 56,
    padding: 16,
    backgroundColor: cardBackgroundColor,
    borderColor,
    borderWidth: 1,
    borderRadius: 12,
  },
  statusText: {
    color: secondaryTextColor,
    fontSize: 16,
    lineHeight: 22,
  },
  promptBox: {
    gap: 12,
    padding: 16,
    backgroundColor: cardBackgroundColor,
    borderColor,
    borderWidth: 1,
    borderRadius: 12,
  },
  fieldLabel: {
    color: primaryTextColor,
    fontSize: 18,
    fontWeight: '600',
  },
  promptInput: {
    minHeight: 96,
    padding: 12,
    color: primaryTextColor,
    backgroundColor: screenBackgroundColor,
    borderColor,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 17,
    lineHeight: 23,
    textAlignVertical: 'top',
  },
  actions: {
    gap: 8,
    paddingVertical: 4,
  },
  preview: {
    width: '100%',
    height: 320,
    backgroundColor: previewBackgroundColor,
    borderColor,
    borderWidth: 1,
    borderRadius: 12,
  },
  previewPlaceholder: {
    alignItems: 'center',
    backgroundColor: previewBackgroundColor,
    borderColor,
    borderRadius: 12,
    borderWidth: 1,
    height: 320,
    justifyContent: 'center',
    width: '100%',
  },
  resultBox: {
    gap: 12,
    padding: 16,
    backgroundColor: cardBackgroundColor,
    borderColor,
    borderWidth: 1,
    borderRadius: 12,
  },
  timingBox: {
    gap: 12,
    padding: 16,
    backgroundColor: cardBackgroundColor,
    borderColor,
    borderWidth: 1,
    borderRadius: 12,
  },
  resultTitle: {
    color: primaryTextColor,
    fontSize: 18,
    fontWeight: '600',
  },
  resultText: {
    color: primaryTextColor,
    fontSize: 22,
    lineHeight: 29,
  },
  timing: {
    marginTop: 8,
    color: secondaryTextColor,
    fontSize: 16,
  },
  timingDetail: {
    color: secondaryTextColor,
    fontSize: 14,
  },
  monospace: {
    color: secondaryTextColor,
    fontFamily: 'Menlo',
    fontSize: 12,
  },
});
