import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Button,
  DynamicColorIOS,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import {
  analyzeImage,
  deleteTemporaryImage,
  type ImageAnalysisResult,
} from './imageAnalysis';

const accentColor = DynamicColorIOS({ light: '#0066cc', dark: '#64a8ff' });
const cameraBackgroundColor = DynamicColorIOS({
  light: '#d4d4d8',
  dark: '#18181b',
});
const primaryTextColor = DynamicColorIOS({ light: '#111111', dark: '#f5f5f7' });
const borderColor = DynamicColorIOS({ light: '#71717a', dark: '#8e8e93' });

export type CameraScanFailureKind =
  | 'permission-denied'
  | 'camera-unavailable'
  | 'capture-failed';

export class CameraScanError extends Error {
  constructor(public readonly kind: CameraScanFailureKind, message: string) {
    super(message);
    this.name = 'CameraScanError';
  }
}

type Props = {
  canAnalyze: boolean;
  prompt: string;
  onActiveChange: (active: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onResult: (result: ImageAnalysisResult) => void;
  onStatus: (status: string) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function LiveCameraScanner({
  canAnalyze,
  prompt,
  onActiveChange,
  onBusyChange,
  onResult,
  onStatus,
}: Props): React.JSX.Element {
  const camera = useRef<Camera>(null);
  const promptRef = useRef(prompt);
  const callbacksRef = useRef({ onBusyChange, onResult, onStatus });
  const [active, setActive] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  promptRef.current = prompt;
  callbacksRef.current = { onBusyChange, onResult, onStatus };

  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        setActive(false);
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active || !initialized || !canAnalyze) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function scan(): Promise<void> {
      if (cancelled || camera.current === null) {
        return;
      }

      callbacksRef.current.onBusyChange(true);
      callbacksRef.current.onStatus('Checking camera…');

      let snapshotPath: string | null = null;

      try {
        const snapshot = await camera.current.takePhoto({
          enableShutterSound: false,
        });
        snapshotPath = snapshot.path;
        const result = await analyzeImage(snapshot.path, promptRef.current);

        if (!cancelled) {
          callbacksRef.current.onResult(result);
          callbacksRef.current.onStatus('Watching continuously…');
        }
      } catch (error) {
        if (!cancelled) {
          const failure = new CameraScanError(
            'capture-failed',
            errorMessage(error),
          );
          console.error(failure);
          callbacksRef.current.onStatus(`Error: ${failure.message}`);
          setActive(false);
        }
      } finally {
        if (snapshotPath !== null) {
          await deleteTemporaryImage(snapshotPath).catch(cleanupError => {
            console.error(cleanupError);
          });
        }

        callbacksRef.current.onBusyChange(false);

        if (!cancelled) {
          timer = setTimeout(scan, 150);
        }
      }
    }

    timer = setTimeout(scan, 150);

    return () => {
      cancelled = true;

      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [active, canAnalyze, initialized]);

  async function toggleCamera(): Promise<void> {
    if (active) {
      setActive(false);
      onStatus('Camera stopped');
      return;
    }

    if (device === undefined) {
      const failure = new CameraScanError(
        'camera-unavailable',
        'Rear camera is unavailable',
      );
      onStatus(`Error: ${failure.message}`);
      return;
    }

    const permitted = hasPermission || (await requestPermission());

    if (!permitted) {
      const failure = new CameraScanError(
        'permission-denied',
        'Camera permission was denied',
      );
      onStatus(`Error: ${failure.message}`);
      return;
    }

    setInitialized(false);
    setActive(true);
    onStatus('Starting camera…');
  }

  return (
    <View style={styles.container}>
      <View style={active ? styles.activeCamera : styles.preview}>
        {active && device !== undefined ? (
          <Camera
            ref={camera}
            accessibilityLabel="Live rear camera"
            device={device}
            isActive={active}
            onInitialized={() => setInitialized(true)}
            photo
            photoQualityBalance="speed"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <Text style={styles.placeholder}>Camera is off</Text>
        )}
      </View>
      <Button
        color={accentColor}
        disabled={!active && !canAnalyze}
        onPress={toggleCamera}
        title={active ? 'Pause' : 'Start continuous camera'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  preview: {
    alignItems: 'center',
    backgroundColor: cameraBackgroundColor,
    borderColor,
    borderRadius: 12,
    borderWidth: 1,
    height: 320,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  activeCamera: {
    height: 1,
    overflow: 'hidden',
    width: 1,
  },
  placeholder: {
    color: primaryTextColor,
    fontSize: 17,
  },
});
