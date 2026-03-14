import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/utils/theme';
import { api, FolderData, ImageData } from '@/utils/api';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_W = (SCREEN_W - 48 - CARD_GAP) / 2;

type ListItem =
  | { kind: 'section'; title: string; key: string }
  | { kind: 'folder'; data: FolderData; key: string }
  | { kind: 'image'; data: ImageData; key: string }
  | { kind: 'empty'; message: string; key: string };

export default function FileManagerScreen() {
  const router = useRouter();
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [sources, setSources] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([api.listFolders(), api.listImages('source')]);
      setFolders(f);
      setSources(s);
    } catch (e: any) {
      console.error('Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const importScreenshot = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please grant media library access to import screenshots.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Error', 'Failed to read image data.');
        return;
      }

      setUploading(true);
      const filename = asset.fileName || 'screenshot.png';
      const uploaded = await api.uploadImage(asset.base64, filename);
      setUploading(false);
      router.push({ pathname: '/editor', params: { imageId: uploaded.id } });
    } catch (e: any) {
      setUploading(false);
      Alert.alert('Upload Error', e.message);
    }
  };

  const deleteFolder = (folder: FolderData) => {
    Alert.alert('Delete Folder', `Delete "${folder.name}" and all its panels?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.deleteFolder(folder.id);
          loadData();
        },
      },
    ]);
  };

  const deleteSource = (img: ImageData) => {
    Alert.alert('Delete Screenshot', 'Remove this screenshot?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.deleteImage(img.id);
          loadData();
        },
      },
    ]);
  };

  // Build flat list items
  const listItems: ListItem[] = [];
  listItems.push({ kind: 'section', title: 'Extracted Panels', key: 'sec-folders' });
  if (folders.length === 0) {
    listItems.push({ kind: 'empty', message: 'No extracted panels yet', key: 'empty-folders' });
  }
  folders.forEach((f) => listItems.push({ kind: 'folder', data: f, key: `f-${f.id}` }));
  listItems.push({ kind: 'section', title: 'Source Screenshots', key: 'sec-sources' });
  if (sources.length === 0) {
    listItems.push({ kind: 'empty', message: 'Import a screenshot to get started', key: 'empty-sources' });
  }
  sources.forEach((s) => listItems.push({ kind: 'image', data: s, key: `i-${s.id}` }));

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'section') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
          <View style={styles.sectionLine} />
        </View>
      );
    }
    if (item.kind === 'empty') {
      return (
        <View style={styles.emptyRow}>
          <Feather name="inbox" size={20} color={colors.muted} />
          <Text style={styles.emptyText}>{item.message}</Text>
        </View>
      );
    }
    if (item.kind === 'folder') {
      const f = item.data;
      return (
        <TouchableOpacity
          testID={`folder-card-${f.id}`}
          style={styles.card}
          onPress={() => router.push({ pathname: '/folder/[id]', params: { id: f.id } })}
          onLongPress={() => deleteFolder(f)}
          activeOpacity={0.7}
        >
          <View style={styles.cardThumb}>
            {f.thumbnail_id ? (
              <Image
                source={{ uri: api.getImageUrl(f.thumbnail_id) }}
                style={styles.thumbImage}
                contentFit="cover"
              />
            ) : (
              <Feather name="folder" size={32} color={colors.muted} />
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{f.name}</Text>
            <Text style={styles.cardMeta}>{f.panel_count} panels</Text>
          </View>
        </TouchableOpacity>
      );
    }
    if (item.kind === 'image') {
      const img = item.data;
      return (
        <TouchableOpacity
          testID={`source-card-${img.id}`}
          style={styles.card}
          onPress={() => router.push({ pathname: '/editor', params: { imageId: img.id } })}
          onLongPress={() => deleteSource(img)}
          activeOpacity={0.7}
        >
          <View style={styles.cardThumb}>
            <Image
              source={{ uri: api.getImageUrl(img.id) }}
              style={styles.thumbImage}
              contentFit="cover"
            />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{img.filename}</Text>
            <Text style={styles.cardMeta}>{img.width} x {img.height}</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="scissors" size={22} color={colors.primary} />
          <Text style={styles.headerTitle}>Panel Extractor</Text>
        </View>
      </View>

      {/* Content */}
      <FlatList
        testID="file-manager-list"
        data={listItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        numColumns={1}
      />

      {/* FAB */}
      <TouchableOpacity
        testID="import-screenshot-btn"
        style={styles.fab}
        onPress={importScreenshot}
        activeOpacity={0.8}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <>
            <Feather name="plus" size={22} color={colors.primaryForeground} />
            <Text style={styles.fabText}>Import</Text>
          </>
        )}
      </TouchableOpacity>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textMain,
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 100,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionLine: {
    height: 1,
    backgroundColor: colors.border,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardThumb: {
    width: 80,
    height: 80,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: 80,
    height: 80,
  },
  cardInfo: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMain,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  fabText: {
    color: colors.primaryForeground,
    fontWeight: '700',
    fontSize: 15,
  },
});
