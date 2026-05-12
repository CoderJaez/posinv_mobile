import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

function getImageExtension(asset: ImagePicker.ImagePickerAsset) {
  const filenameExtension = asset.fileName?.split('.').pop()?.toLowerCase();

  if (filenameExtension && filenameExtension.length <= 5) {
    return filenameExtension;
  }

  if (asset.mimeType?.includes('png')) {
    return 'png';
  }

  if (asset.mimeType?.includes('webp')) {
    return 'webp';
  }

  return 'jpg';
}

function createProductImagesDirectory() {
  const directory = new Directory(Paths.document, 'product-images');

  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }

  return directory;
}

export async function pickAndStoreProductImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);

  if (!permission.granted) {
    throw new Error('Photo library permission is required to upload a product image.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    mediaTypes: ['images'],
    quality: 0.82,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  const directory = createProductImagesDirectory();
  const extension = getImageExtension(asset);
  const destination = new File(
    directory,
    `product-${Date.now()}-${Math.floor(Math.random() * 10000)}.${extension}`
  );

  try {
    const source = new File(asset.uri);
    source.copy(destination);
    return destination.uri;
  } catch {
    return asset.uri;
  }
}
