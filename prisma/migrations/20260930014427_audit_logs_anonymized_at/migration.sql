-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "anonymizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "audit_logs_companyId_anonymizedAt_createdAt_idx" ON "audit_logs"("companyId", "anonymizedAt", "createdAt");
