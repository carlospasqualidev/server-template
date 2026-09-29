import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { type App } from "@/app";
import { ServiceUnavailableError } from "@/lib/errors";
import * as s3 from "@/lib/storage/s3";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { buildMultipartBody } from "@/tests/helpers/multipart";
import { sessionCookiesFor } from "@/tests/helpers/session";

const UPLOAD_URL = "/api/client/upload/file";
const s3Mock = mockClient(S3Client);

describe("POST /api/client/upload/file", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(() => {
    s3Mock.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("faz streaming do arquivo para o S3 e devolve a URL pública em Location", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const user = await createUser();
    const { payload, contentType } = buildMultipartBody([
      { fieldName: "file", fileName: "relatório.PDF", contentType: "application/pdf", content: "conteudo-do-pdf" },
    ]);

    const response = await app.inject({
      method: "POST",
      url: UPLOAD_URL,
      cookies: sessionCookiesFor(user.id),
      headers: { "content-type": contentType },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      Location: expect.stringMatching(/^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com\/\d+-[0-9a-f-]+\.pdf$/),
      key: expect.stringMatching(/\.pdf$/),
      fileName: expect.stringMatching(/\.pdf$/),
      originalName: "relatório.PDF",
      mimeType: "application/pdf",
      size: Buffer.byteLength("conteudo-do-pdf"),
    });

    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]?.args[0].input).toMatchObject({ Bucket: "test-bucket", ContentType: "application/pdf" });
  });

  it("sem arquivo no campo file responde 400", async () => {
    const user = await createUser();
    const { payload, contentType } = buildMultipartBody([
      { fieldName: "outro", fileName: "a.txt", contentType: "text/plain", content: "x" },
    ]);

    const response = await app.inject({
      method: "POST",
      url: UPLOAD_URL,
      cookies: sessionCookiesFor(user.id),
      headers: { "content-type": contentType },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Use o campo [file] para enviar o arquivo." });
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("requisição que não é multipart responde 400", async () => {
    const user = await createUser();

    const response = await app.inject({
      method: "POST",
      url: UPLOAD_URL,
      cookies: sessionCookiesFor(user.id),
      payload: { file: "nao" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Envie o arquivo usando multipart/form-data." });
  });

  it("sem sessão responde 401 antes de ler o arquivo", async () => {
    const { payload, contentType } = buildMultipartBody([
      { fieldName: "file", fileName: "a.txt", contentType: "text/plain", content: "x" },
    ]);

    const response = await app.inject({
      method: "POST",
      url: UPLOAD_URL,
      headers: { "content-type": contentType },
      payload,
    });

    expect(response.statusCode).toBe(401);
  });

  it("storage não configurado responde 503", async () => {
    vi.spyOn(s3, "getStorageConfig").mockImplementation(() => {
      throw new ServiceUnavailableError("Upload de arquivos não está configurado neste ambiente.");
    });
    const user = await createUser();
    const { payload, contentType } = buildMultipartBody([
      { fieldName: "file", fileName: "a.txt", contentType: "text/plain", content: "x" },
    ]);

    const response = await app.inject({
      method: "POST",
      url: UPLOAD_URL,
      cookies: sessionCookiesFor(user.id),
      headers: { "content-type": contentType },
      payload,
    });

    expect(response.statusCode).toBe(503);
  });
});
