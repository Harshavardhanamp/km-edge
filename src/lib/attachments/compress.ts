import * as ImageManipulator from 'expo-image-manipulator';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_PX = 2048;

export async function compressImage(
  uri: string,
  mimeType: string
): Promise<{ uri: string; estimatedSize: number }> {
  if (!IMAGE_TYPES.has(mimeType)) {
    return { uri, estimatedSize: 0 };
  }

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_PX, height: MAX_PX } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );

  return { uri: result.uri, estimatedSize: 0 };
  // estimatedSize=0 — actual size determined by expo-file-system after copy
}
