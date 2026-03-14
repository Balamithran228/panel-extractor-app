import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Dimensions,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors } from '@/utils/theme';
import { api, FolderDetail, ImageData } from '@/utils/api';

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 10;
const COLUMNS = 2;
const THUMB_W = (SCREEN_W - 32 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

export default function FolderViewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [folder, setFolder] = useState<FolderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPanel, setSelectedPanel] = useState<ImageData | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getFolder(id)
      .then(setFolder)
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const sharePanel = async (panel: ImageData) => {
    const url = api.getImageUrl(panel.id);
    try {
      await Share.share({
        message: `Check out this panel: ${panel.filename}`,
        url: url,
      });
    } catch (e: any) {
      if (e.message !== 'User did not share') {
        Alert.alert('Share Error', e.message);
      }
    }
  };

  const shareAllPanels = async () => {
    if (!folder) return;
    const urls = folder.panels.map((p) => api.getImageUrl(p.id)).join('\n');
    try {
      await Share.share({
        message: `${folder.name}\n\n${urls}`,
        title: folder.name,
      });
    } catch (e: any) {
      if (e.message !== 'User did not share') {
        Alert.alert('Share Error', e.message);
      }
    }
  };

  const deleteThisFolder = () => {
    if (!folder) return;
    Alert.alert('Delete Folder', `Delete "${folder.name}" and all ${folder.panels.length} panels?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.deleteFolder(folder.id);
          router.back();
        },
      },
    ]);
  };

  const renderPanel = ({ item, index }: { item: ImageData; index: number }) => {
    const imageUrl = api.getImageUrl(item.id);
    const thumbH = (item.height / item.width) * THUMB_W;
    const clampedH = Math.min(thumbH, THUMB_W * 2);

    return (
      <TouchableOpacity
        testID={`panel-card-${index}`}
        style={[styles.panelCard, { width: THUMB_W }]}
        onPress={() => setSelectedPanel(item)}
        onLongPress={() => sharePanel(item)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: imageUrl }}
          style={{ width: THUMB_W - 2, height: clampedH, borderRadius: 8 }}
          contentFit="cover"
        />
        <Text style={styles.panelLabel}>{item.filename}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!folder) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Folder not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          testID="folder-back-btn"
          onPress={() => router.back()}
          style={styles.headerBtn}
        >
          <Feather name="chevron-left" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {folder.name}
          </Text>
          <Text style={styles.headerSub}>{folder.panels.length} panels</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            testID="share-all-btn"
            onPress={shareAllPanels}
            style={styles.headerBtn}
          >
            <Feather name="share-2" size={20} color={colors.textMain} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="delete-folder-btn"
            onPress={deleteThisFolder}
            style={styles.headerBtn}
          >
            <Feather name="trash-2" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Panels grid */}
      {folder.panels.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="image" size={48} color={colors.muted} />
          <Text style={styles.emptyText}>No panels extracted</Text>
        </View>
      ) : (
        <FlatList
          testID="panels-grid"
          data={folder.panels}
          renderItem={renderPanel}
          keyExtractor={(p) => p.id}
          numColumns={COLUMNS}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
        />
      )}

      {/* Full screen preview modal */}
      {selectedPanel && (
        <View style={styles.previewOverlay}>
          <SafeAreaView style={styles.previewSafe}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>{selectedPanel.filename}</Text>
              <View style={styles.previewActions}>
                <TouchableOpacity
                  testID="preview-share-btn"
                  onPress={() => sharePanel(selectedPanel)}
                  style={styles.previewBtn}
                >
                  <Feather name="share-2" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  testID="preview-close-btn"
                  onPress={() => setSelectedPanel(null)}
                  style={styles.previewBtn}
                >
                  <Feather name="x" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.previewBody}>
              <Image
                source={{ uri: api.getImageUrl(selectedPanel.id) }}
                style={styles.previewImage}
                contentFit="contain"
              />
            </View>
          </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    paddingLeft: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textMain,
  },
  headerSub: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 2,
  },
  gridContent: {
    padding: 16,
    paddingBottom: 40,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  panelCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
  },
  panelLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
    paddingVertical: 8,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: colors.muted,
  },
  errorText: {
    color: colors.muted,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 80,
  },
  // Preview modal
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 100,
  },
  previewSafe: {
    flex: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 8,
  },
  previewBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
