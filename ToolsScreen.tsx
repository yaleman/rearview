import Slider from '@react-native-community/slider';
import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  DynamicColorIOS,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  BluetoothIndicatorClient,
  IndicatorSendError,
  type BluetoothConnectionState,
  type RgbValue,
} from './bluetoothRgb';

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
const accentColor = DynamicColorIOS({ light: '#0066cc', dark: '#64a8ff' });

const connectionPresentation: Record<BluetoothConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
};

type ChannelSliderProps = {
  label: string;
  maximumValue?: number;
  minimumValue?: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
};

function ChannelSlider({
  label,
  maximumValue = 255,
  minimumValue = 0,
  onChange,
  step = 1,
  value,
}: ChannelSliderProps): React.JSX.Element {
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderLabelRow}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text accessibilityLabel={`${label} value`} style={styles.sliderValue}>
          {value}
        </Text>
      </View>
      <Slider
        accessibilityLabel={`${label} slider`}
        maximumTrackTintColor="#8e8e93"
        maximumValue={maximumValue}
        minimumValue={minimumValue}
        minimumTrackTintColor="#0a84ff"
        onValueChange={nextValue => onChange(Math.round(nextValue))}
        step={step}
        thumbTintColor="#0a84ff"
        value={value}
      />
    </View>
  );
}

function sendErrorMessage(error: unknown): string {
  if (error instanceof IndicatorSendError) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

export default function ToolsScreen(): React.JSX.Element {
  const clientRef = useRef<BluetoothIndicatorClient | null>(null);
  const [value, setValue] = useState<RgbValue>({
    red: 255,
    green: 0,
    blue: 0,
    brightness: 255,
  });
  const [text, setText] = useState('Rearview');
  const [flashDuration, setFlashDuration] = useState(1000);
  const [flashIntensity, setFlashIntensity] = useState(255);
  const [sending, setSending] = useState<
    'rgb' | 'text' | 'flash' | 'clear' | null
  >(null);
  const [result, setResult] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<BluetoothConnectionState>('disconnected');

  if (clientRef.current === null) {
    clientRef.current = new BluetoothIndicatorClient();
  }

  useEffect(() => {
    const unsubscribe =
      clientRef.current?.subscribeToConnectionState(setConnectionState);

    return () => {
      unsubscribe?.();
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, []);

  function setChannel(channel: keyof RgbValue, channelValue: number): void {
    setValue(currentValue => ({
      ...currentValue,
      [channel]: channelValue,
    }));
  }

  async function connect(): Promise<void> {
    setResult(null);

    try {
      await clientRef.current?.connect();
      setResult('Connected to Rearview Light');
    } catch (error) {
      setResult(`Error: ${sendErrorMessage(error)}`);
    }
  }

  async function send(): Promise<void> {
    setSending('rgb');
    setResult(null);

    try {
      await clientRef.current?.sendRgb(value);
      setResult(
        `Sent ${value.red}, ${value.green}, ${value.blue} at ${value.brightness} brightness`,
      );
    } catch (error) {
      setResult(`Error: ${sendErrorMessage(error)}`);
    } finally {
      setSending(null);
    }
  }

  async function sendText(): Promise<void> {
    setSending('text');
    setResult(null);

    try {
      await clientRef.current?.sendText(text);
      setResult(`Sent text: ${text}`);
    } catch (error) {
      setResult(`Error: ${sendErrorMessage(error)}`);
    } finally {
      setSending(null);
    }
  }

  async function sendFlash(): Promise<void> {
    setSending('flash');
    setResult(null);

    try {
      await clientRef.current?.sendFlash(flashDuration, flashIntensity);
      setResult(
        `Started flash with ${flashDuration} ms phases at ${flashIntensity} intensity`,
      );
    } catch (error) {
      setResult(`Error: ${sendErrorMessage(error)}`);
    } finally {
      setSending(null);
    }
  }

  async function sendClear(): Promise<void> {
    setSending('clear');
    setResult(null);

    try {
      await clientRef.current?.sendClear();
      setResult('Cleared indicator');
    } catch (error) {
      setResult(`Error: ${sendErrorMessage(error)}`);
    } finally {
      setSending(null);
    }
  }

  const brightnessScale = value.brightness / 255;
  const expectedRed = Math.round(value.red * brightnessScale);
  const expectedGreen = Math.round(value.green * brightnessScale);
  const expectedBlue = Math.round(value.blue * brightnessScale);
  const expectedColour = `rgb(${expectedRed}, ${expectedGreen}, ${expectedBlue})`;
  const connectionLabel = connectionPresentation[connectionState];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pageHeadingRow}>
        <Text style={styles.title}>Tools</Text>
        <Button
          accessibilityLabel={`Bluetooth status: ${connectionLabel}`}
          color={accentColor}
          disabled={connectionState !== 'disconnected' || sending !== null}
          onPress={connect}
          title={connectionLabel}
        />
      </View>

      <View style={styles.toolCard}>
        <View style={styles.toolHeadingRow}>
          <Text style={styles.toolTitle}>Send RGB</Text>
          <View
            accessibilityLabel="Expected colour"
            style={[styles.colourPreview, { backgroundColor: expectedColour }]}
          />
        </View>

        <ChannelSlider
          label="Red"
          onChange={channelValue => setChannel('red', channelValue)}
          value={value.red}
        />
        <ChannelSlider
          label="Green"
          onChange={channelValue => setChannel('green', channelValue)}
          value={value.green}
        />
        <ChannelSlider
          label="Blue"
          onChange={channelValue => setChannel('blue', channelValue)}
          value={value.blue}
        />
        <ChannelSlider
          label="Brightness"
          onChange={channelValue => setChannel('brightness', channelValue)}
          value={value.brightness}
        />

        <Button
          color={accentColor}
          disabled={sending !== null}
          onPress={send}
          title={sending === 'rgb' ? 'Sending…' : 'Send RGB'}
        />
      </View>

      <View style={styles.toolCard}>
        <Text style={styles.toolTitle}>Send text</Text>
        <TextInput
          accessibilityLabel="Indicator text"
          autoCapitalize="sentences"
          maxLength={120}
          multiline
          onChangeText={setText}
          placeholder="Text to display"
          placeholderTextColor={secondaryTextColor}
          style={styles.textInput}
          value={text}
        />
        <Button
          color={accentColor}
          disabled={sending !== null || text.length === 0}
          onPress={sendText}
          title={sending === 'text' ? 'Sending…' : 'Send text'}
        />
      </View>

      <View style={styles.toolCard}>
        <Text style={styles.toolTitle}>Flash</Text>
        <ChannelSlider
          label="Duration (ms)"
          maximumValue={10000}
          minimumValue={100}
          onChange={setFlashDuration}
          step={100}
          value={flashDuration}
        />
        <ChannelSlider
          label="Intensity"
          onChange={setFlashIntensity}
          value={flashIntensity}
        />
        <Button
          color={accentColor}
          disabled={sending !== null}
          onPress={sendFlash}
          title={sending === 'flash' ? 'Sending…' : 'Flash'}
        />
      </View>

      <View style={styles.toolCard}>
        <Text style={styles.toolTitle}>Clear screen</Text>
        <Button
          color={accentColor}
          disabled={sending !== null}
          onPress={sendClear}
          title={sending === 'clear' ? 'Clearing…' : 'Clear'}
        />
      </View>

      {result !== null && (
        <Text accessibilityLiveRegion="polite" style={styles.resultText}>
          {result}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    color: primaryTextColor,
    fontSize: 32,
    fontWeight: '700',
  },
  pageHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolCard: {
    backgroundColor: cardBackgroundColor,
    borderColor,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  toolHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolTitle: {
    color: primaryTextColor,
    fontSize: 22,
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: cardBackgroundColor,
    borderColor,
    borderRadius: 8,
    borderWidth: 1,
    color: primaryTextColor,
    fontSize: 17,
    minHeight: 72,
    padding: 12,
    textAlignVertical: 'top',
  },
  colourPreview: {
    borderColor,
    borderRadius: 6,
    borderWidth: 1,
    height: 36,
    width: 36,
  },
  sliderRow: {
    gap: 4,
  },
  sliderLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: primaryTextColor,
    fontSize: 17,
    fontWeight: '600',
  },
  sliderValue: {
    color: secondaryTextColor,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  resultText: {
    color: secondaryTextColor,
    fontSize: 16,
    lineHeight: 22,
  },
});
