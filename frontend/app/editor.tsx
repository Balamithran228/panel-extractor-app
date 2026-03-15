import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors } from '@/utils/theme';
import { db, ImageData } from '@/utils/db';

const SCREEN_W = Dimensions.get('window').width;
const MARKER_OFFSET = 0.25; // 25% from top

export default function EditorScreen() {
  const router = useRouter();
  const { imageId } = useLocalSearchParams<{ imageId: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [imageUri, setImageUri] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [markers, setMarkers] = useState<number[]>([]);
  const [showExtractionSuccess, setShowExtractionSuccess] = useState(false);
  const [extractionResult, setExtractionResult] = useState<{ panel_count: number; folder_name: string } | null>(null);

  const displayWidth = SCREEN_W;
  const displayHeight = imageData
    ? (imageData.height / imageData.width) * displayWidth
    : 0;

  useEffect(() => {
    if (!imageId) return;
    (async () => {
      try {
        const img = await db.getImage(imageId);
        setImageData(img);
        const uri = await db.getImageUriById(imageId);
        setImageUri(uri);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [imageId]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setScrollY(e.nativeEvent.contentOffset.y);
    },
    []
  );

  const handleLayout = useCallback((e: any) => {
    setViewportH(e.nativeEvent.layout.height);
  }, []);

  const addMarker = () => {
    if (!displayHeight) return;
    const pos = scrollY + viewportH * MARKER_OFFSET;
    const clamped = Math.max(0, Math.min(pos, displayHeight));
    setMarkers((prev) => {
      const updated = [...prev, clamped];
      updated.sort((a, b) => a - b);
      return updated;
    });
  };

  const undoMarker = () => setMarkers((prev) => prev.slice(0, -1));

  const clearMarkers = () => {
    if (markers.length === 0) return;
    Alert.alert('Clear Markers', 'Remove all markers?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setMarkers([]) },
    ]);
  };

  const processMarkers = async () => {
    if (markers.length < 2) {
      Alert.alert('Not enough markers', 'Place at least 2 markers to extract panels.');
      return;
    }
    if (markers.length % 2 !== 0) {
      Alert.alert('Invalid markers', 'Markers must be even to extract panels.');
      return;
    }
    if (!imageData) return;

    setProcessing(true);
    try {
      const result = await db.processMarkers({
        image_id: imageData.id,
        markers,
        display_width: displayWidth,
        display_height: displayHeight,
      });
      setExtractionResult({ panel_count: result.panel_count, folder_name: result.folder_name });
      setShowExtractionSuccess(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setProcessing(false);
    }
  };

  const panelCount = Math.floor(markers.length / 2);
  const isOdd = markers.length > 0 && markers.length % 2 !== 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!imageData) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Image not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            testID="editor-back-btn"
            onPress={() => router.back()}
            style={styles.headerBtn}
          >
            <Feather name="chevron-left" size={24} color={colors.textMain} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Editor</Text>
            <View style={[styles.markerBadge, isOdd && styles.markerBadgeWarn]}>
              <Text style={[styles.markerBadgeText, isOdd && styles.markerBadgeTextWarn]}>
                {markers.length} markers
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              testID="undo-marker-btn"
              onPress={undoMarker}
              style={styles.headerBtn}
              disabled={markers.length === 0}
            >
              <Feather
                name="rotate-ccw"
                size={20}
                color={markers.length === 0 ? colors.muted : colors.textMain}
              />
            </TouchableOpacity>
            <TouchableOpacity
              testID="clear-markers-btn"
              onPress={clearMarkers}
              style={styles.headerBtn}
              disabled={markers.length === 0}
            >
              <Feather
                name="trash-2"
                size={20}
                color={markers.length === 0 ? colors.muted : colors.textMain}
              />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Image + markers */}
      <View style={styles.editorBody} onLayout={handleLayout}>
        <ScrollView
          ref={scrollRef}
          testID="editor-scroll-view"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          contentContainerStyle={{ minHeight: displayHeight }}
        >
          <View style={{ width: displayWidth, height: displayHeight, position: 'relative' }}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: displayWidth, height: displayHeight }}
              contentFit="fill"
              cachePolicy="memory-disk"
            />
            {/* RGB segmented marker lines */}
            {markers.map((pos, idx) => (
              <View key={idx} style={[styles.markerWrap, { top: pos - 1 }]}>
                <View style={[styles.markerSeg, { backgroundColor: '#ef4444' }]} />
                <View style={[styles.markerSeg, { backgroundColor: '#22c55e' }]} />
                <View style={[styles.markerSeg, { backgroundColor: '#3b82f6' }]} />
                <View style={styles.markerLabel}>
                  <Text style={styles.markerLabelText}>{idx + 1}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Reference guide line at 35% from top */}
        <View
          style={[styles.refLineWrap, { top: `${MARKER_OFFSET * 100}%` }]}
          pointerEvents="none"
        >
          <View style={styles.refLineDash} />
          <View style={styles.refLabelBg}>
            <Text style={styles.refLabelText}>Cut here</Text>
          </View>
        </View>

        {/* Place Marker FAB — bottom right */}
        <TouchableOpacity
          testID="add-marker-btn"
          style={styles.markerFab}
          onPress={addMarker}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={22} color={colors.primaryForeground} />
        </TouchableOpacity>
      </View>

      {/* Bottom bar — process only */}
      <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
        <TouchableOpacity
          testID="process-btn"
          style={[styles.processBtn, (markers.length < 2 || isOdd) && styles.processBtnDisabled]}
          onPress={processMarkers}
          disabled={markers.length < 2 || isOdd || processing}
          activeOpacity={0.8}
        >
          {processing ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Feather name="scissors" size={18} color={colors.primaryForeground} />
              <Text style={styles.processText}>
                EXTRACT {panelCount} {panelCount === 1 ? 'PANEL' : 'PANELS'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {/* Extraction Success Modal */}
      <Modal visible={showExtractionSuccess} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successIconWrap}>
              <Feather name="check-circle" size={48} color={colors.success} />
            </View>
            <Text style={styles.modalTitle}>Panels extracted successfully</Text>
            {extractionResult && (
              <Text style={styles.modalMessage}>
                {extractionResult.panel_count} panel{extractionResult.panel_count > 1 ? 's' : ''} saved to "{extractionResult.folder_name}"
              </Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                testID="extraction-success-btn"
                style={styles.modalBtnPrimary}
                onPress={() => {
                  setShowExtractionSuccess(false);
                  router.replace('/');
                }}
              >
                <Text style={styles.modalBtnPrimText}>Return to Main Page</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  safeTop: { backgroundColor: colors.background, zIndex: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain },
  markerBadge: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  markerBadgeWarn: { backgroundColor: 'rgba(239,68,68,0.2)' },
  markerBadgeText: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
  markerBadgeTextWarn: { color: colors.primary },
  headerActions: { flexDirection: 'row', gap: 2 },
  editorBody: { flex: 1, position: 'relative' },

  /* ── RGB marker ── */
  markerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    flexDirection: 'row',
    zIndex: 5,
  },
  markerSeg: { flex: 1, height: 3 },
  markerLabel: {
    position: 'absolute',
    right: 8,
    top: -10,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  markerLabelText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  /* ── Reference line ── */
  refLineWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
    transform: [{ translateY: -1 }],
  },
  refLineDash: { flex: 1, height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(239,68,68,0.45)' },
  refLabelBg: {
    backgroundColor: 'rgba(239,68,68,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  refLabelText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },

  /* ── Marker FAB ── */
  markerFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },

  /* ── Bottom bar ── */
  bottomBar: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  processBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
  },
  processBtnDisabled: { backgroundColor: colors.surfaceHighlight, opacity: 0.6 },
  processText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryForeground,
    letterSpacing: 0.8,
  },
  errorText: { color: colors.muted, fontSize: 16, textAlign: 'center', marginTop: 80 },

  /* ── Extraction success modal ── */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    width: SCREEN_W - 48, backgroundColor: '#27272a', borderRadius: 16,
    padding: 24, borderWidth: 1, borderColor: '#52525b',
    elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20,
    alignItems: 'center',
  },
  successIconWrap: { marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain, marginBottom: 12, textAlign: 'center' },
  modalMessage: { fontSize: 14, color: colors.mutedForeground, marginBottom: 4, lineHeight: 20, textAlign: 'center' },
  modalActions: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 20, width: '100%' },
  modalBtnPrimary: {
    flex: 1, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center',
  },
  modalBtnPrimText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 14 },
});
