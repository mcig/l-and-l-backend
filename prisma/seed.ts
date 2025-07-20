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
    // Pizzas
    { name: 'Margherita Pizza', actualCategory: 'pizza' },
    { name: 'Pepperoni Pizza', actualCategory: 'pizza' },
    { name: 'BBQ Chicken Pizza', actualCategory: 'pizza' },
    { name: 'Hawaiian Pizza', actualCategory: 'pizza' },
    { name: 'Supreme Pizza', actualCategory: 'pizza' },
    { name: 'Veggie Pizza', actualCategory: 'pizza' },
    { name: 'Meat Lovers Pizza', actualCategory: 'pizza' },
    { name: 'Buffalo Chicken Pizza', actualCategory: 'pizza' },

    // Salads
    { name: 'Caesar Salad', actualCategory: 'salad' },
    { name: 'Greek Salad', actualCategory: 'salad' },
    { name: 'Cobb Salad', actualCategory: 'salad' },
    { name: 'Garden Salad', actualCategory: 'salad' },
    { name: 'Spinach Salad', actualCategory: 'salad' },
    { name: 'Nicoise Salad', actualCategory: 'salad' },
    { name: 'Waldorf Salad', actualCategory: 'salad' },
    { name: 'Caprese Salad', actualCategory: 'salad' },

    // Drinks
    { name: 'Coke', actualCategory: 'drink' },
    { name: 'Water', actualCategory: 'drink' },
    { name: 'Coffee', actualCategory: 'drink' },
    { name: 'Tea', actualCategory: 'drink' },
    { name: 'Orange Juice', actualCategory: 'drink' },
    { name: 'Lemonade', actualCategory: 'drink' },
    { name: 'Milk', actualCategory: 'drink' },
    { name: 'Beer', actualCategory: 'drink' },
    { name: 'Wine', actualCategory: 'drink' },
    { name: 'Smoothie', actualCategory: 'drink' },

    // Appetizers & Sides
    { name: 'Garlic Bread', actualCategory: 'appetizer' },
    { name: 'Chicken Wings', actualCategory: 'appetizer' },
    { name: 'Mozzarella Sticks', actualCategory: 'appetizer' },
    { name: 'Onion Rings', actualCategory: 'appetizer' },
    { name: 'French Fries', actualCategory: 'appetizer' },
    { name: 'Breadsticks', actualCategory: 'appetizer' },
    { name: 'Nachos', actualCategory: 'appetizer' },
    { name: 'Bruschetta', actualCategory: 'appetizer' },

    // Main Courses
    { name: 'Grilled Chicken', actualCategory: 'main' },
    { name: 'Beef Burger', actualCategory: 'main' },
    { name: 'Fish Tacos', actualCategory: 'main' },
    { name: 'Pasta Carbonara', actualCategory: 'main' },
    { name: 'Steak', actualCategory: 'main' },
    { name: 'Salmon', actualCategory: 'main' },
    { name: 'Shrimp Scampi', actualCategory: 'main' },
    { name: 'Beef Tacos', actualCategory: 'main' },

    // Desserts
    { name: 'Chocolate Cake', actualCategory: 'dessert' },
    { name: 'Ice Cream', actualCategory: 'dessert' },
    { name: 'Cheesecake', actualCategory: 'dessert' },
    { name: 'Apple Pie', actualCategory: 'dessert' },
    { name: 'Tiramisu', actualCategory: 'dessert' },
    { name: 'Brownie', actualCategory: 'dessert' },
    { name: 'Chocolate Chip Cookie', actualCategory: 'dessert' },
    { name: 'Creme Brulee', actualCategory: 'dessert' },
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
