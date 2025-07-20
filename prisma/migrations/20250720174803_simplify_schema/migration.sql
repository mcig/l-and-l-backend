/*
  Warnings:

  - You are about to drop the `Counterexample` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Example` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Hypothesis` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SourceData` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Counterexample" DROP CONSTRAINT "Counterexample_hypothesisId_fkey";

-- DropForeignKey
ALTER TABLE "Example" DROP CONSTRAINT "Example_hypothesisId_fkey";

-- DropForeignKey
ALTER TABLE "Example" DROP CONSTRAINT "Example_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Hypothesis" DROP CONSTRAINT "Hypothesis_sessionId_fkey";

-- DropTable
DROP TABLE "Counterexample";

-- DropTable
DROP TABLE "Example";

-- DropTable
DROP TABLE "Hypothesis";

-- DropTable
DROP TABLE "SourceData";

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnedDFA" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "states" TEXT NOT NULL,
    "alphabet" TEXT NOT NULL,
    "transitions" TEXT NOT NULL,
    "startState" TEXT NOT NULL,
    "acceptStates" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnedDFA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearnedDFA_sessionId_key" ON "LearnedDFA"("sessionId");

-- AddForeignKey
ALTER TABLE "LearnedDFA" ADD CONSTRAINT "LearnedDFA_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
