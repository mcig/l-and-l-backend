import { PrismaClient } from './generated/prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Clear existing data
  await prisma.item.deleteMany()
  await prisma.learningSession.deleteMany()
  await prisma.oracleQuery.deleteMany()
  await prisma.learnedDFA.deleteMany()

  // Add pizza and food items
  const items = [
    { name: 'Margherita Pizza' },
    { name: 'Pepperoni Pizza' },
    { name: 'BBQ Chicken Pizza' },
    { name: 'Hawaiian Pizza' },
    { name: 'Coke' },
    { name: 'Water' },
    { name: 'Caesar Salad' },
    { name: 'Greek Salad' },
    { name: 'Garlic Bread' },
    { name: 'Chicken Wings' },
  ]

  for (const item of items) {
    await prisma.item.create({
      data: item,
    })
  }

  // Create a learning session for food categorization
  await prisma.learningSession.create({
    data: {
      name: 'Food Categorization',
      description: "Learn to categorize food items using Angluin's algorithm",
      status: 'active',
    },
  })

  console.log('Seed data created successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
