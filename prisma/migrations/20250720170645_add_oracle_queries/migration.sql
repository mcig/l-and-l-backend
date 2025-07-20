-- CreateTable
CREATE TABLE "OracleQuery" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "queryType" TEXT NOT NULL,
    "queryData" TEXT NOT NULL,
    "response" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OracleQuery_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OracleQuery" ADD CONSTRAINT "OracleQuery_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
