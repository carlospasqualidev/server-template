-- AlterTable
ALTER TABLE "users" ADD COLUMN     "idleTimeoutMinutes" INTEGER;

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_companyId_key_key" ON "system_configs"("companyId", "key");

-- AddForeignKey
ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
