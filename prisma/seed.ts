import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient, Prisma } from '../prisma/generated/prisma/client'

const prisma = new PrismaClient().$extends(withAccelerate())

const userData: Prisma.UserCreateInput[] = [
  {
    name: 'Alice',
    email: 'alice@prisma.io',
    posts: {
      create: [
        {
          title: 'Join the Prisma Discord',
          content: 'https://pris.ly/discord',
          published: true,
        },
      ],
    },
  },
  {
    name: 'Nilu',
    email: 'nilu@prisma.io',
    posts: {
      create: [
        {
          title: 'Follow Prisma on Twitter',
          content: 'https://www.twitter.com/prisma',
          published: true,
          viewCount: 42,
        },
      ],
    },
  },
  {
    name: 'Mahmoud',
    email: 'mahmoud@prisma.io',
    posts: {
      create: [
        {
          title: 'Ask a question about Prisma on GitHub',
          content: 'https://www.github.com/prisma/prisma/discussions',
          published: true,
          viewCount: 128,
        },
        {
          title: 'Prisma on YouTube',
          content: 'https://pris.ly/youtube',
        },
      ],
    },
  },
]

const menuItemsData: Prisma.T1CreateManyInput[] = [
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
]

const sampleMappings: Prisma.ProposedMappingCreateManyInput[] = [
  {
    description: 'Extract item name without category prefix',
    functionCode: `
    const nameParts = entry.name.split(' ');
    const category = entry.category;
    // For some items like "BBQ Chicken Pizza", keep more context
    let title = entry.name;
    if (entry.name.endsWith(category)) {
      title = entry.name.substring(0, entry.name.length - category.length - 1);
    }
    return {
      title: title,
      price: entry.price,
      category: entry.category
    };`,
    status: 'pending',
  },
  {
    description: 'Capitalize category names',
    functionCode: `
    return {
      title: entry.name,
      price: entry.price,
      category: entry.category.toUpperCase()
    };`,
    status: 'rejected',
  },
]

async function main() {
  console.log(`Start seeding ...`)
  // Seed users and posts as before
  for (const u of userData) {
    const user = await prisma.user.create({
      data: u,
    })
    console.log(`Created user with id: ${user.id}`)
  }

  // Seed menu items
  await prisma.menuItem.deleteMany()
  await prisma.category.deleteMany()
  await prisma.t1.deleteMany()
  await prisma.proposedMapping.deleteMany()

  await prisma.t1.createMany({
    data: menuItemsData,
  })
  console.log(`Created ${menuItemsData.length} menu items in T1`)

  // Seed sample mappings
  await prisma.proposedMapping.createMany({
    data: sampleMappings,
  })
  console.log(`Created ${sampleMappings.length} sample mappings`)

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
