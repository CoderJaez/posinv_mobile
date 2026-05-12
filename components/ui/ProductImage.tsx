import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View, type ImageStyle, type ViewStyle } from 'react-native';

import { palette, radii } from '@/constants/theme';

type Props = {
  imageUri?: string | null;
  imageColor: string;
  size?: number;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
};

export function ProductImage({
  imageUri,
  imageColor,
  size = 58,
  style,
  imageStyle,
}: Props) {
  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: imageColor, height: size, width: size },
        style,
      ]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={[styles.image, imageStyle]} resizeMode="cover" />
      ) : (
        <Ionicons name="cube-outline" size={Math.max(22, size * 0.48)} color={palette.ink} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    borderRadius: radii.sm,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    height: '100%',
    width: '100%',
  },
});
