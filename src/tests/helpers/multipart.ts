interface MultipartFilePart {
  fieldName: string;
  fileName: string;
  contentType: string;
  content: Buffer | string;
}

/** Monta um body multipart/form-data cru para `inject()`, sem depender de FormData. */
export function buildMultipartBody(parts: MultipartFilePart[]): { payload: Buffer; contentType: string } {
  const boundary = `----vitest-${Date.now()}`;
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.fieldName}"; filename="${part.fileName}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
      ),
    );
    chunks.push(Buffer.isBuffer(part.content) ? part.content : Buffer.from(part.content));
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
