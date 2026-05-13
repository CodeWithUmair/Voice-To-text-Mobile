import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

const COLORS = {
  bg: '#0f0f11',
  surface: '#1a1a1f',
  border: '#2a2a32',
  accent: '#7c6af7',
  recording: '#ef4444',
  partial: '#9a93f0',
  text: '#e8e8f0',
  muted: '#6b6b7a',
  success: '#22c55e',
  warn: '#f59e0b',
};

const LANGS = [
  { label: 'EN', value: 'en-US' },
  { label: 'UR', value: 'ur-PK' },
  { label: 'HI', value: 'hi-IN' },
  { label: 'AR', value: 'ar-SA' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <VoiceToText />
    </SafeAreaProvider>
  );
}

function VoiceToText() {
  const [accepted, setAccepted] = useState('');
  const [partial, setPartial] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Ready — tap mic to start');
  const [language, setLanguage] = useState('en-US');
  const [showInfo, setShowInfo] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [onDevice, setOnDevice] = useState(true);
  const [supportsOnDevice, setSupportsOnDevice] = useState(true);
  const [installedLocales, setInstalledLocales] = useState([]);

  const languageRef = useRef('en-US');
  const onDeviceRef = useRef(true);
  const acceptedRef = useRef('');

  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { onDeviceRef.current = onDevice; }, [onDevice]);
  useEffect(() => { acceptedRef.current = accepted; }, [accepted]);

  useEffect(() => {
    try {
      const ok = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition?.() ?? false;
      setSupportsOnDevice(ok);
      if (!ok) setOnDevice(false);
    } catch {
      setSupportsOnDevice(false);
      setOnDevice(false);
    }
    (async () => {
      try {
        const res = await ExpoSpeechRecognitionModule.getSupportedLocales({
          androidRecognitionServicePackage: 'com.google.android.as',
        });
        setInstalledLocales(res?.installedLocales || []);
      } catch {}
    })();
  }, []);

  useSpeechRecognitionEvent('start', () => {
    setIsRecording(true);
    setStatus('Listening… tap stop when done');
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
    setPartial((p) => {
      if (p) commitChunk(p);
      return '';
    });
    setStatus((s) => (s.startsWith('❌') ? s : 'Done — edit if needed, or tap mic to add more'));
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    if (!transcript) return;
    if (event.isFinal) {
      commitChunk(transcript);
      setPartial('');
    } else {
      setPartial(transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsRecording(false);
    setPartial('');
    const msg = errorMessage(event);
    setStatus('❌ ' + msg);
  });

  useSpeechRecognitionEvent('nomatch', () => {
    setStatus('No speech detected — try again');
  });

  function commitChunk(chunk) {
    const piece = chunk.trim();
    if (!piece) return;
    setAccepted((cur) => {
      const merged = cur.trim() ? cur.trim() + ' ' + piece : piece;
      acceptedRef.current = merged;
      Clipboard.setStringAsync(merged).catch(() => {});
      return merged;
    });
    showToast();
  }

  async function start() {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone blocked',
          'Enable it in Android Settings → Apps → Voice to Text → Permissions.'
        );
        return;
      }

      setPartial('');
      setStatus('Starting…');

      ExpoSpeechRecognitionModule.start({
        lang: languageRef.current,
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: onDeviceRef.current && supportsOnDevice,
        addsPunctuation: true,
        androidRecognitionServicePackage: 'com.google.android.as',
        androidIntentOptions: {
          EXTRA_PREFER_OFFLINE: onDeviceRef.current && supportsOnDevice,
        },
      });
    } catch (e) {
      setIsRecording(false);
      setStatus('❌ ' + (e?.message || String(e)));
    }
  }

  function stop() {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
  }

  function toggleRecord() {
    if (isRecording) stop();
    else start();
  }

  async function copyText() {
    const t = displayText().trim();
    if (!t) return;
    await Clipboard.setStringAsync(t);
    showToast();
  }

  function clearAll() {
    if (isRecording) return;
    setAccepted('');
    setPartial('');
    acceptedRef.current = '';
    setStatus('Cleared — tap mic to start');
  }

  function showToast() {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1500);
  }

  function displayText() {
    if (!partial) return accepted;
    return accepted.trim() ? accepted.trim() + ' ' + partial : partial;
  }

  function handleEdit(next) {
    if (isRecording) return;
    setAccepted(next);
    acceptedRef.current = next;
  }

  const hasText = displayText().trim().length > 0;
  const micColor = isRecording ? COLORS.recording : COLORS.accent;
  const micLabel = isRecording ? 'Stop' : 'Record';
  const localeInstalled = installedLocales.includes(language);
  const offlineActive = onDevice && supportsOnDevice;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.appIcon}>
            <Text style={styles.appIconText}>🎙</Text>
          </View>
          <Text style={styles.title}>Voice to Text</Text>
          <View style={[styles.badge, offlineActive ? styles.badgeOk : styles.badgeWarn]}>
            <Text style={styles.badgeText}>{offlineActive ? 'Offline' : 'Online'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowInfo(true)} style={styles.gearBtn}>
          <Text style={styles.gearText}>⚙</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.outputWrap}>
          <TextInput
            style={styles.output}
            value={displayText()}
            onChangeText={handleEdit}
            placeholder="Tap the mic and start speaking — words appear as you talk."
            placeholderTextColor={COLORS.muted}
            multiline
            textAlignVertical="top"
            editable={!isRecording}
            scrollEnabled
          />
          {isRecording && partial ? (
            <View style={styles.partialPill}>
              <View style={styles.pulseDot} />
              <Text style={styles.partialPillText} numberOfLines={1}>
                {partial}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.spacer} />

        <View style={styles.langRow}>
          {LANGS.map((l) => {
            const active = language === l.value;
            const installed = installedLocales.includes(l.value);
            return (
              <TouchableOpacity
                key={l.value}
                onPress={() => !isRecording && setLanguage(l.value)}
                style={[styles.langChip, active && styles.langChipActive]}
                disabled={isRecording}
              >
                <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                  {l.label}
                  {offlineActive && !installed ? ' ·' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {offlineActive && !localeInstalled ? (
          <Text style={styles.warnText}>
            "{language}" offline pack not installed — recognition may fall back to network or fail. Open ⚙ for help.
          </Text>
        ) : null}

        <Text style={styles.statusText} numberOfLines={2}>
          {status}
        </Text>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.actionBtn, (!hasText || isRecording) && styles.actionBtnDisabled]}
            onPress={clearAll}
            disabled={!hasText || isRecording}
          >
            <Text style={styles.actionBtnText}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.micBtn, { backgroundColor: micColor }]}
            onPress={toggleRecord}
            activeOpacity={0.8}
          >
            <Text style={styles.micLabel}>{micLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              !hasText && styles.actionBtnDisabled,
            ]}
            onPress={copyText}
            disabled={!hasText}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Copy</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {toastVisible && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>Copied ✓</Text>
        </View>
      )}

      <Modal
        visible={showInfo}
        animationType="fade"
        transparent
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Recognition Mode</Text>

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => supportsOnDevice && setOnDevice((v) => !v)}
              disabled={!supportsOnDevice}
            >
              <View style={styles.toggleLabelWrap}>
                <Text style={styles.toggleLabel}>On-device only</Text>
                <Text style={styles.toggleHint}>
                  {supportsOnDevice
                    ? 'Runs fully offline using Google\'s on-device speech model. No data leaves the phone.'
                    : 'Not supported on this device — using Google\'s online recognizer.'}
                </Text>
              </View>
              <View style={[styles.switch, onDevice && styles.switchOn]}>
                <View style={[styles.switchKnob, onDevice && styles.switchKnobOn]} />
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            <Text style={styles.modalTitle}>Offline Language Packs</Text>
            <Text style={styles.modalHint}>
              For offline recognition, install language packs on your phone:{'\n'}
              Settings → Languages & input → Speech Recognition & Synthesis from Google → Offline speech recognition.
            </Text>

            <View style={styles.localeList}>
              {LANGS.map((l) => {
                const installed = installedLocales.includes(l.value);
                return (
                  <View key={l.value} style={styles.localeRow}>
                    <Text style={styles.localeName}>{l.value}</Text>
                    <Text style={[styles.localeStatus, installed ? styles.localeOk : styles.localeMissing]}>
                      {installed ? '✓ installed' : '— not installed'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => setShowInfo(false)}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function errorMessage(event) {
  switch (event?.error) {
    case 'not-allowed':
      return 'Mic or speech permission denied';
    case 'no-speech':
      return 'No speech detected';
    case 'speech-timeout':
      return 'Stopped — no speech for a while';
    case 'language-not-supported':
      return 'Language not supported on this device';
    case 'service-not-allowed':
      return 'Speech service unavailable. Install Google offline speech model.';
    case 'network':
      return 'Network required for this language. Enable on-device or install offline pack.';
    case 'busy':
      return 'Recognizer busy — try again';
    case 'audio-capture':
      return 'Mic error — close other recording apps';
    default:
      return event?.message || event?.error || 'Unknown error';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconText: { fontSize: 14 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeOk: { borderColor: COLORS.success, backgroundColor: 'rgba(34,197,94,0.12)' },
  badgeWarn: { borderColor: COLORS.warn, backgroundColor: 'rgba(245,158,11,0.12)' },
  badgeText: { color: COLORS.text, fontSize: 10, fontWeight: '600' },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderColor: COLORS.border,
    borderWidth: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearText: { color: COLORS.muted, fontSize: 18 },
  content: { flex: 1, padding: 16, gap: 12 },
  outputWrap: { position: 'relative' },
  output: {
    minHeight: 200,
    maxHeight: 400,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 24,
  },
  partialPill: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(124,106,247,0.18)',
    borderWidth: 1,
    borderColor: COLORS.partial,
    maxWidth: '90%',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.recording,
  },
  partialPillText: { color: COLORS.partial, fontSize: 11, fontStyle: 'italic' },
  spacer: { flex: 1 },
  langRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  langChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  langChipText: { color: COLORS.muted, fontSize: 12, fontWeight: '500' },
  langChipTextActive: { color: 'white' },
  statusText: { color: COLORS.muted, fontSize: 13, paddingHorizontal: 2 },
  warnText: { color: COLORS.warn, fontSize: 11, paddingHorizontal: 2 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 6,
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  micLabel: { color: 'white', fontSize: 14, fontWeight: '600' },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionBtnPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  actionBtnTextPrimary: { color: 'white' },
  toast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: COLORS.success,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 4,
  },
  toastText: { color: 'white', fontSize: 13, fontWeight: '500' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 12,
  },
  modalTitle: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  modalHint: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleLabelWrap: { flex: 1, gap: 4 },
  toggleLabel: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  toggleHint: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  switch: {
    width: 44,
    height: 26,
    borderRadius: 999,
    backgroundColor: COLORS.border,
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: COLORS.accent },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.text,
  },
  switchKnobOn: { alignSelf: 'flex-end' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  localeList: { gap: 6 },
  localeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  localeName: { color: COLORS.text, fontSize: 13, fontFamily: Platform.select({ android: 'monospace' }) },
  localeStatus: { fontSize: 12 },
  localeOk: { color: COLORS.success },
  localeMissing: { color: COLORS.muted },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 4,
  },
});
