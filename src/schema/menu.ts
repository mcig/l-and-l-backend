import { builder } from '../builder'
import { prisma } from '../db'

// Define T1 type (Old Menu System)
builder.prismaObject('T1', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    price: t.exposeFloat('price'),
    category: t.exposeString('category'),
  }),
})

// Define Category type (New Menu System)
builder.prismaObject('Category', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    title: t.exposeString('title'),
    menuItems: t.relation('menuItems'),
  }),
})

// Define MenuItem type (New Menu System)
builder.prismaObject('MenuItem', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    title: t.exposeString('title'),
    price: t.exposeFloat('price'),
    category: t.relation('category'),
  }),
})

// Define ProposedMapping type
builder.prismaObject('ProposedMapping', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    description: t.exposeString('description'),
    functionCode: t.exposeString('functionCode'),
    status: t.exposeString('status'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
})

// Input types
const MappingInput = builder.inputType('MappingInput', {
  fields: (t) => ({
    description: t.string({ required: true }),
    functionCode: t.string({ required: true }),
  }),
})

const MappingStatusInput = builder.inputType('MappingStatusInput', {
  fields: (t) => ({
    id: t.int({ required: true }),
    status: t.string({ required: true }),
  }),
})

// T1 input for seeding
const T1CreateInput = builder.inputType('T1CreateInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    price: t.float({ required: true }),
    category: t.string({ required: true }),
  }),
})

// Query fields
builder.queryFields((t) => ({
  // Get all T1 entries (source data)
  allT1Entries: t.prismaField({
    type: ['T1'],
    resolve: (query) => prisma.t1.findMany({ ...query }),
  }),

  // Get all Category entries
  allCategories: t.prismaField({
    type: ['Category'],
    resolve: (query) => prisma.category.findMany({ ...query }),
  }),

  // Get all MenuItem entries (target data)
  allMenuItems: t.prismaField({
    type: ['MenuItem'],
    resolve: (query) =>
      prisma.menuItem.findMany({
        ...query,
        include: {
          category: true,
        },
      }),
  }),

  // Get all proposed mappings
  allMappings: t.prismaField({
    type: ['ProposedMapping'],
    resolve: (query) =>
      prisma.proposedMapping.findMany({
        ...query,
        orderBy: { createdAt: 'desc' },
      }),
  }),

  // Get mapping by ID
  mappingById: t.prismaField({
    type: 'ProposedMapping',
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, parent, args) =>
      prisma.proposedMapping.findUnique({
        ...query,
        where: { id: args.id },
      }),
  }),
}))

// Mutation fields
builder.mutationFields((t) => ({
  // Seed T1 data
  seedT1Data: t.prismaField({
    type: ['T1'],
    args: {
      data: t.arg({
        type: [T1CreateInput],
        required: true,
      }),
    },
    resolve: async (query, parent, args) => {
      // Clear existing data
      await prisma.menuItem.deleteMany()
      await prisma.category.deleteMany()
      await prisma.t1.deleteMany()

      // Create new T1 entries
      return prisma.t1
        .createMany({
          data: args.data,
        })
        .then(() => prisma.t1.findMany())
    },
  }),

  // Propose a new mapping
  proposeMapping: t.prismaField({
    type: 'ProposedMapping',
    args: {
      data: t.arg({
        type: MappingInput,
        required: true,
      }),
    },
    resolve: async (query, parent, args) => {
      return prisma.proposedMapping.create({
        ...query,
        data: {
          description: args.data.description,
          functionCode: args.data.functionCode,
          status: 'pending',
        },
      })
    },
  }),

  // Evaluate mapping (accept or reject)
  evaluateMapping: t.prismaField({
    type: 'ProposedMapping',
    args: {
      data: t.arg({
        type: MappingStatusInput,
        required: true,
      }),
    },
    resolve: async (query, parent, args) => {
      // Update the mapping status
      const updatedMapping = await prisma.proposedMapping.update({
        where: { id: args.data.id },
        data: { status: args.data.status },
      })

      // If accepted, apply the mapping
      if (args.data.status === 'accepted') {
        // Get all T1 entries
        const t1Entries = await prisma.t1.findMany()

        // Get the mapping record to access its function code
        const mapping = await prisma.proposedMapping.findUnique({
          where: { id: args.data.id },
        })

        if (!mapping) {
          throw new Error('Mapping not found')
        }

        // Parse the function code to create a transformation function
        // CAUTION: In production, you should use a secure evaluation method
        // This is a simplified example for demonstration purposes
        const transformFn = new Function('entry', mapping.functionCode)

        // First, collect all unique categories
        const categories = new Set<string>()
        t1Entries.forEach((entry) => {
          const transformed = transformFn(entry)
          categories.add(transformed.category)
        })

        // Create all categories
        for (const categoryTitle of Array.from(categories)) {
          await prisma.category.upsert({
            where: { title: categoryTitle },
            update: {},
            create: { title: categoryTitle },
          })
        }

        // Now create menu items with category references
        for (const entry of t1Entries) {
          const transformed = transformFn(entry)
          const category = await prisma.category.findUnique({
            where: { title: transformed.category },
          })

          if (category) {
            await prisma.menuItem.create({
              data: {
                title: transformed.title,
                price: transformed.price,
                categoryId: category.id,
              },
            })
          }
        }
      }

      return updatedMapping
    },
  }),

  // Reset data and mappings
  resetData: t.field({
    type: 'Boolean',
    resolve: async () => {
      await prisma.menuItem.deleteMany()
      await prisma.category.deleteMany()
      await prisma.t1.deleteMany()
      await prisma.proposedMapping.deleteMany()
      return true
    },
  }),
}))
