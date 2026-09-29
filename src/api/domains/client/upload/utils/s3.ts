import { S3Client } from "@aws-sdk/client-s3";
import { envVariables } from "../../../../../config/envVariables";

let s3Client: S3Client | null = null;

export function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      credentials: {
        accessKeyId: envVariables.AWS_ACCESS_KEY_ID,
        secretAccessKey: envVariables.AWS_SECRET_ACCESS_KEY,
      },
      region: envVariables.AWS_BUCKET_REGION,
    });
  }

  return s3Client;
}

export function buildPublicFileUrl(fileKey: string) {
  return `https://${envVariables.AWS_S3_BUCKET}.s3.${envVariables.AWS_BUCKET_REGION}.amazonaws.com/${fileKey}`;
}
