import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient, Prisma } from '../prisma/generated/prisma/client'

const prisma = new PrismaClient().$extends(withAccelerate())

// Sample source data for the demo
const sourceDataItems: Prisma.SourceDataCreateManyInput[] = [
  { name: 'Margherita Pizza', price: 9.99, category: 'Pizza' },
  { name: 'BBQ Chicken Pizza', price: 11.99, category: 'Pizza' },
  { name: 'Pepperoni Pizza', price: 10.99, category: 'Pizza' },
  { name: 'Caesar Salad', price: 7.5, category: 'Salad' },
  { name: 'Greek Salad', price: 8.5, category: 'Salad' },
  { name: 'Spaghetti Carbonara', price: 10.5, category: 'Pasta' },
  { name: 'Penne Arrabbiata', price: 9.5, category: 'Pasta' },
  { name: 'Chocolate Cake', price: 6.0, category: 'Dessert' },
  { name: 'Tiramisu', price: 5.5, category: 'Dessert' },
  { name: 'Espresso Coffee', price: 2.5, category: 'Drinks' },
  { name: 'Fresh Orange Juice', price: 3.0, category: 'Drinks' },
  { name: 'Hawaiian Pizza', price: 12.99, category: 'Pizza' },
  { name: 'Veggie Supreme Pizza', price: 11.5, category: 'Pizza' },
  { name: 'Cobb Salad', price: 8.99, category: 'Salad' },
  { name: 'Pasta Bolognese', price: 11.0, category: 'Pasta' },
  { name: 'Cheesecake', price: 6.5, category: 'Dessert' },
  { name: 'Cappuccino', price: 3.5, category: 'Drinks' },
]

async function main() {
  console.log(`Start seeding ...`)

  // Clear existing data
  await prisma.counterexample.deleteMany()
  await prisma.example.deleteMany()
  await prisma.hypothesis.deleteMany()
  await prisma.learningSession.deleteMany()
  await prisma.sourceData.deleteMany()

  // Seed source data
  await prisma.sourceData.createMany({
    data: sourceDataItems,
  })
  console.log(`Created ${sourceDataItems.length} source data items`)

  // Create multiple sample learning sessions
  const sessions = [
    {
      name: 'Menu Item Name Transformation',
      description:
        'Learn to transform menu item names by removing category suffixes',
      status: 'active' as const,
    },
    {
      name: 'Price Format Standardization',
      description: 'Standardize price formats across different menu systems',
      status: 'active' as const,
    },
    {
      name: 'Category Mapping',
      description:
        'Map categories between different menu classification systems',
      status: 'completed' as const,
    },
  ]

  for (const sessionData of sessions) {
    const learningSession = await prisma.learningSession.create({
      data: sessionData,
    })

    // Add examples based on session type
    if (sessionData.name === 'Menu Item Name Transformation') {
      const examples = [
        {
          sourceData: JSON.stringify({
            name: 'Margherita Pizza',
            price: 9.99,
            category: 'Pizza',
          }),
          targetData: JSON.stringify({
            title: 'Margherita',
            price: 9.99,
            category: 'Pizza',
          }),
          type: 'positive' as const,
        },
        {
          sourceData: JSON.stringify({
            name: 'BBQ Chicken Pizza',
            price: 11.99,
            category: 'Pizza',
          }),
          targetData: JSON.stringify({
            title: 'BBQ Chicken',
            price: 11.99,
            category: 'Pizza',
          }),
          type: 'positive' as const,
        },
        {
          sourceData: JSON.stringify({
            name: 'Caesar Salad',
            price: 7.5,
            category: 'Salad',
          }),
          targetData: JSON.stringify({
            title: 'Caesar Salad',
            price: 7.5,
            category: 'Salad',
          }),
          type: 'positive' as const,
        },
        {
          sourceData: JSON.stringify({
            name: 'Spaghetti Carbonara',
            price: 10.5,
            category: 'Pasta',
          }),
          targetData: JSON.stringify({
            title: 'Spaghetti Carbonara',
            price: 10.5,
            category: 'Pasta',
          }),
          type: 'positive' as const,
        },
        {
          sourceData: JSON.stringify({
            name: 'Chocolate Cake',
            price: 6.0,
            category: 'Dessert',
          }),
          targetData: JSON.stringify({
            title: 'Chocolate Cake',
            price: 6.0,
            category: 'Dessert',
          }),
          type: 'positive' as const,
        },
        {
          sourceData: JSON.stringify({
            name: 'Hawaiian Pizza',
            price: 12.99,
            category: 'Pizza',
          }),
          targetData: JSON.stringify({
            title: 'Hawaiian',
            price: 12.99,
            category: 'Pizza',
          }),
          type: 'positive' as const,
        },
      ]

      for (const example of examples) {
        await prisma.example.create({
          data: {
            sessionId: learningSession.id,
            ...example,
          },
        })
      }

      // Create a pre-generated hypothesis
      await prisma.hypothesis.create({
        data: {
          sessionId: learningSession.id,
          functionCode: `let title = entry.name;
if (entry.name.endsWith(entry.category) && entry.name !== entry.category) {
  title = entry.name.substring(0, entry.name.length - entry.category.length - 1);
}
return { title, price: entry.price, category: entry.category };`,
          description: 'Remove category suffix from item names when present',
          status: 'active',
          confidence: 0.85,
        },
      })
    }

    if (sessionData.name === 'Price Format Standardization') {
      const examples = [
        {
          sourceData: JSON.stringify({
            name: 'Margherita Pizza',
            price: 9.99,
            currency: 'USD',
          }),
          targetData: JSON.stringify({
            name: 'Margherita Pizza',
            price: 999,
            currency: 'cents',
          }),
          type: 'positive' as const,
        },
        {
          sourceData: JSON.stringify({
            name: 'BBQ Chicken Pizza',
            price: 11.99,
            currency: 'USD',
          }),
          targetData: JSON.stringify({
            name: 'BBQ Chicken Pizza',
            price: 1199,
            currency: 'cents',
          }),
          type: 'positive' as const,
        },
      ]

      for (const example of examples) {
        await prisma.example.create({
          data: {
            sessionId: learningSession.id,
            ...example,
          },
        })
      }
    }

    if (sessionData.name === 'Category Mapping') {
      const examples = [
        {
          sourceData: JSON.stringify({
            name: 'Margherita Pizza',
            category: 'Pizza',
          }),
          targetData: JSON.stringify({
            name: 'Margherita Pizza',
            category: 'Main Course',
          }),
          type: 'positive' as const,
        },
        {
          sourceData: JSON.stringify({
            name: 'Caesar Salad',
            category: 'Salad',
          }),
          targetData: JSON.stringify({
            name: 'Caesar Salad',
            category: 'Appetizer',
          }),
          type: 'positive' as const,
        },
        {
          sourceData: JSON.stringify({
            name: 'Chocolate Cake',
            category: 'Dessert',
          }),
          targetData: JSON.stringify({
            name: 'Chocolate Cake',
            category: 'Sweet',
          }),
          type: 'positive' as const,
        },
      ]

      for (const example of examples) {
        await prisma.example.create({
          data: {
            sessionId: learningSession.id,
            ...example,
          },
        })
      }

      // Create a completed hypothesis
      await prisma.hypothesis.create({
        data: {
          sessionId: learningSession.id,
          functionCode: `const categoryMap = {
  'Pizza': 'Main Course',
  'Salad': 'Appetizer',
  'Pasta': 'Main Course',
  'Dessert': 'Sweet',
  'Drinks': 'Beverage'
};
return {
  name: entry.name,
  category: categoryMap[entry.category] || entry.category
};`,
          description: 'Map categories to standardized classification',
          status: 'completed',
          confidence: 0.95,
        },
      })
    }

    console.log(`Created session: ${sessionData.name}`)
  }

  console.log(`Seeding finished.`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
