import Slider from '@react-native-community/slider';
import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  DynamicColorIOS,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  BluetoothRgbSender,
  RgbSendError,
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

type ChannelKey = keyof RgbValue;

type ChannelSliderProps = {
  channel: ChannelKey;
  label: string;
  onChange: (channel: ChannelKey, value: number) => void;
  value: number;
};

function ChannelSlider({
  channel,
  label,
  onChange,
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
        maximumValue={255}
        minimumTrackTintColor="#0a84ff"
        minimumValue={0}
        onValueChange={nextValue => onChange(channel, Math.round(nextValue))}
        step={1}
        thumbTintColor="#0a84ff"
        value={value}
      />
    </View>
  );
}

function sendErrorMessage(error: unknown): string {
  if (error instanceof RgbSendError) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

export default function ToolsScreen(): React.JSX.Element {
  const senderRef = useRef<BluetoothRgbSender | null>(null);
  const [value, setValue] = useState<RgbValue>({
    red: 255,
    green: 0,
    blue: 0,
    brightness: 255,
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (senderRef.current === null) {
    senderRef.current = new BluetoothRgbSender();
  }

  useEffect(
    () => () => {
      senderRef.current?.destroy();
      senderRef.current = null;
    },
    [],
  );

  function setChannel(channel: ChannelKey, channelValue: number): void {
    setValue(currentValue => ({
      ...currentValue,
      [channel]: channelValue,
    }));
  }

  async function send(): Promise<void> {
    setSending(true);
    setResult(null);

    try {
      await senderRef.current?.send(value);
      setResult(
        `Sent ${value.red}, ${value.green}, ${value.blue} at ${value.brightness} brightness`,
      );
    } catch (error) {
      setResult(`Error: ${sendErrorMessage(error)}`);
    } finally {
      setSending(false);
    }
  }

  const brightnessScale = value.brightness / 255;
  const expectedRed = Math.round(value.red * brightnessScale);
  const expectedGreen = Math.round(value.green * brightnessScale);
  const expectedBlue = Math.round(value.blue * brightnessScale);
  const expectedColour = `rgb(${expectedRed}, ${expectedGreen}, ${expectedBlue})`;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Tools</Text>

      <View style={styles.toolCard}>
        <View style={styles.toolHeadingRow}>
          <Text style={styles.toolTitle}>Send RGB</Text>
          <View
            accessibilityLabel="Expected colour"
            style={[styles.colourPreview, { backgroundColor: expectedColour }]}
          />
        </View>

        <ChannelSlider
          channel="red"
          label="Red"
          onChange={setChannel}
          value={value.red}
        />
        <ChannelSlider
          channel="green"
          label="Green"
          onChange={setChannel}
          value={value.green}
        />
        <ChannelSlider
          channel="blue"
          label="Blue"
          onChange={setChannel}
          value={value.blue}
        />
        <ChannelSlider
          channel="brightness"
          label="Brightness"
          onChange={setChannel}
          value={value.brightness}
        />

        <Button
          color={accentColor}
          disabled={sending}
          onPress={send}
          title={sending ? 'Sending…' : 'Send'}
        />

        {result !== null && (
          <Text accessibilityLiveRegion="polite" style={styles.resultText}>
            {result}
          </Text>
        )}
      </View>
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
