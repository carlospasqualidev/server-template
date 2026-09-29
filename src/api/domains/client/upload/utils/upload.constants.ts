export const MAX_UPLOAD_FILE_SIZE_IN_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 10;

export function formatUploadFileSizeInMb(sizeInBytes: number) {
  const sizeInMb = sizeInBytes / (1024 * 1024);

  return Number.isInteger(sizeInMb) ? String(sizeInMb) : sizeInMb.toFixed(2).replace(".", ",");
}
