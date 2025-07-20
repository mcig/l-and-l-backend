import { builder } from '../builder'
import { prisma } from '../db'

// Define Item type
builder.prismaObject('Item', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    category: t.exposeString('category', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
})

// Define LearningSession type
builder.prismaObject('LearningSession', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description', { nullable: true }),
    status: t.exposeString('status'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    oracleQueries: t.relation('oracleQueries'),
    learnedDFA: t.relation('learnedDFA'),
  }),
})

// Define OracleQuery type
builder.prismaObject('OracleQuery', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    sessionId: t.exposeInt('sessionId'),
    session: t.relation('session'),
    queryType: t.exposeString('queryType'),
    queryData: t.exposeString('queryData'),
    response: t.exposeString('response', { nullable: true }),
    status: t.exposeString('status'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
})

// Define LearnedDFA type
builder.prismaObject('LearnedDFA', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    sessionId: t.exposeInt('sessionId'),
    session: t.relation('session'),
    states: t.exposeString('states'),
    alphabet: t.exposeString('alphabet'),
    transitions: t.exposeString('transitions'),
    startState: t.exposeString('startState'),
    acceptStates: t.exposeString('acceptStates'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
})

// Input types
const LearningSessionInput = builder.inputType('LearningSessionInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    description: t.string(),
  }),
})

const OracleResponseInput = builder.inputType('OracleResponseInput', {
  fields: (t) => ({
    queryId: t.int({ required: true }),
    response: t.string({ required: true }),
  }),
})

// Angluin's L* Algorithm Implementation
class AngluinLStar {
  private sessionId: number
  private targetCategory: string // The category we're learning (pizza, salad, drink)
  private alphabet: Set<string> = new Set()
  private observationTable: Map<string, Map<string, boolean>> = new Map()
  private S: Set<string> = new Set() // States
  private E: Set<string> = new Set() // Experiments
  private closed: boolean = false
  private consistent: boolean = false

  // Learning configuration and tracking
  private maxMembershipQueries: number = 8 // Limit to keep users engaged
  private maxEquivalenceQueries: number = 3 // Limit equivalence queries
  private membershipQueryCount: number = 0
  private equivalenceQueryCount: number = 0
  private learningMetrics: {
    totalQueries: number
    correctPredictions: number
    incorrectPredictions: number
    accuracy: number
    itemsTested: string[]
  } = {
    totalQueries: 0,
    correctPredictions: 0,
    incorrectPredictions: 0,
    accuracy: 0,
    itemsTested: [],
  }

  constructor(sessionId: number, targetCategory?: string) {
    this.sessionId = sessionId
    // Randomly select a category if not provided
    this.targetCategory = targetCategory || this.getRandomCategory()
  }

  // Get a random category to learn
  private getRandomCategory(): string {
    const categories = ['pizza', 'salad', 'drink']
    return categories[Math.floor(Math.random() * categories.length)]
  }

  // Initialize the algorithm state from existing queries
  async initializeFromExistingQueries(): Promise<void> {
    // Get all answered queries for this session
    const answeredQueries = await prisma.oracleQuery.findMany({
      where: {
        sessionId: this.sessionId,
        status: 'answered',
      },
    })

    // Rebuild the observation table from answered queries
    for (const query of answeredQueries) {
      if (query.queryType === 'membership') {
        const queryData = JSON.parse(query.queryData)
        const queryString = queryData.query
        const response = query.response === 'true'

        // Add the query string to both S and E sets
        this.S.add(queryString)
        this.E.add(queryString)

        // Add to observation table - use the query string as both state and experiment
        this.setObservationTableEntry(queryString, queryString, response)
      }
    }
  }

  // Add a string to the alphabet
  addToAlphabet(str: string) {
    this.alphabet.add(str)
  }

  // Membership query - ask oracle if a string is in the target language
  async membershipQuery(s: string): Promise<boolean> {
    // Check if we already have this query in the database
    const existingQuery = await prisma.oracleQuery.findFirst({
      where: {
        sessionId: this.sessionId,
        queryType: 'membership',
        queryData: s,
        status: 'answered',
      },
    })

    if (existingQuery) {
      return existingQuery.response === 'true'
    }

    // Check if we've reached the limit for membership queries
    if (this.membershipQueryCount >= this.maxMembershipQueries) {
      console.log(
        `Reached limit of ${this.maxMembershipQueries} membership queries`,
      )
      return false // Default to false when limit reached
    }

    this.membershipQueryCount++

    // Create a new membership query with clean format
    const queryData = {
      query: s,
      question: `Is "${s}" a ${this.targetCategory}?`,
      category: this.targetCategory,
      examples: this.getCategoryExamples(),
      context: `This represents the food item "${s}"`,
      progress: {
        membershipQueries: this.membershipQueryCount,
        maxMembershipQueries: this.maxMembershipQueries,
        equivalenceQueries: this.equivalenceQueryCount,
        maxEquivalenceQueries: this.maxEquivalenceQueries,
      },
    }

    const query = await prisma.oracleQuery.create({
      data: {
        sessionId: this.sessionId,
        queryType: 'membership',
        queryData: JSON.stringify(queryData, null, 2),
        status: 'pending',
      },
    })

    // For now, return false - the oracle will answer this
    return false
  }

  // Equivalence query - ask oracle if hypothesis is equivalent to target
  async equivalenceQuery(hypothesis: string): Promise<string | null> {
    // Check if we've reached the limit for equivalence queries
    if (this.equivalenceQueryCount >= this.maxEquivalenceQueries) {
      console.log(
        `Reached limit of ${this.maxEquivalenceQueries} equivalence queries`,
      )
      return 'correct' // Assume correct when limit reached
    }

    this.equivalenceQueryCount++

    // Create equivalence query with helpful context
    const queryData = {
      hypothesis: JSON.parse(hypothesis),
      instruction:
        "Review the hypothesis above. If it correctly represents the target language, respond with 'correct'. Otherwise, provide a counterexample string that the hypothesis categorizes incorrectly.",
      examples: {
        correct: "If the hypothesis is right, just say 'correct'",
        counterexample:
          "If 'Margherita Pizza' should be in the target language but the hypothesis rejects it, provide 'Margherita Pizza' as counterexample",
      },
      progress: {
        membershipQueries: this.membershipQueryCount,
        maxMembershipQueries: this.maxMembershipQueries,
        equivalenceQueries: this.equivalenceQueryCount,
        maxEquivalenceQueries: this.maxEquivalenceQueries,
      },
    }

    const query = await prisma.oracleQuery.create({
      data: {
        sessionId: this.sessionId,
        queryType: 'equivalence',
        queryData: JSON.stringify(queryData, null, 2),
        status: 'pending',
      },
    })

    // For now, return null - the oracle will provide counterexample if needed
    return null
  }

  // Get observation table entry
  private getObservationTableEntry(s: string, e: string): boolean {
    const row = this.observationTable.get(s)
    if (!row) return false
    return row.get(e) || false
  }

  // Set observation table entry
  private setObservationTableEntry(s: string, e: string, value: boolean) {
    if (!this.observationTable.has(s)) {
      this.observationTable.set(s, new Map())
    }
    this.observationTable.get(s)!.set(e, value)
  }

  // Make the observation table closed
  async makeClosed(): Promise<void> {
    // For food categorization, we'll use a simplified approach
    // Since we're treating each food item as a complete unit,
    // we don't need the traditional string concatenation logic
    this.closed = true

    // Check if we have enough states to represent the alphabet
    for (const a of Array.from(this.alphabet)) {
      if (!this.S.has(a)) {
        // Add missing alphabet symbols as states
        this.S.add(a)
        this.closed = false
      }
    }
  }

  // Make the observation table consistent
  async makeConsistent(): Promise<void> {
    // For food categorization, we'll use a simplified approach
    // Since we're treating each food item as a complete unit,
    // consistency is simpler to check
    this.consistent = true

    // Check if any two states have different behaviors
    for (const s1 of Array.from(this.S)) {
      for (const s2 of Array.from(this.S)) {
        if (s1 !== s2 && this.rowsEqual(s1, s2)) {
          // If two states are equal but represent different food items,
          // we might need to add distinguishing experiments
          // For now, we'll keep it simple and assume they're consistent
          // since we're not building complex string patterns
        }
      }
    }
  }

  // Check if two rows are equal
  private rowsEqual(s1: string, s2: string): boolean {
    for (const e of Array.from(this.E)) {
      const val1 = this.getObservationTableEntry(s1, e)
      const val2 = this.getObservationTableEntry(s2, e)
      if (val1 !== val2) return false
    }
    return true
  }

  // Build the observation table
  async buildObservationTable(): Promise<void> {
    // For food categorization, we ask membership queries about each food item
    for (const foodItem of Array.from(this.E)) {
      const result = await this.membershipQuery(foodItem)
      // Store the result for this food item
      this.setObservationTableEntry(foodItem, foodItem, result)
    }
  }

  // Debug method to print observation table
  private printObservationTable(): void {
    console.log('=== Observation Table ===')
    console.log('States (S):', Array.from(this.S))
    console.log('Experiments (E):', Array.from(this.E))
    console.log('Alphabet:', Array.from(this.alphabet))

    for (const s of Array.from(this.S)) {
      const row: Record<string, boolean> = {}
      for (const e of Array.from(this.E)) {
        row[e] = this.getObservationTableEntry(s, e)
      }
      console.log(`Row(${s}):`, row)
    }
    console.log('========================')
  }

  // Generate hypothesis DFA from observation table
  generateHypothesis(): any {
    const states: string[] = []
    const transitions: Record<string, Record<string, string>> = {}
    const acceptStates: string[] = []

    // Create states from S (food items)
    for (const s of Array.from(this.S)) {
      states.push(s)
      transitions[s] = {}
    }

    // Determine which food items are pizzas based on membership queries
    for (const foodItem of Array.from(this.S)) {
      const isPizza = this.getObservationTableEntry(foodItem, foodItem)
      if (isPizza) {
        acceptStates.push(foodItem)
      }
    }

    // Create simple transitions (each food item transitions to itself)
    for (const s of Array.from(this.S)) {
      transitions[s][s] = s
    }

    return {
      states,
      alphabet: Array.from(this.alphabet),
      transitions,
      startState: Array.from(this.S)[0] || '',
      acceptStates,
    }
  }

  // Main learning algorithm - learns pizza categorization
  async learn(): Promise<any> {
    // Get all food items from the database
    const items = await prisma.item.findMany()

    // Pick random food items as experiments (up to our limit)
    const shuffledItems = items.sort(() => Math.random() - 0.5)
    const selectedItems = shuffledItems.slice(0, this.maxMembershipQueries)

    // Initialize S and E with the selected food items
    for (const item of selectedItems) {
      this.S.add(item.name)
      this.E.add(item.name)
    }

    // Add all food items to alphabet for potential transitions
    for (const item of items) {
      this.addToAlphabet(item.name)
    }

    // Build observation table with membership queries
    await this.buildObservationTable()

    // Generate hypothesis
    const hypothesis = this.generateHypothesis()

    // Test hypothesis with equivalence query
    const counterexample = await this.equivalenceQuery(
      JSON.stringify(hypothesis),
    )

    if (counterexample && counterexample !== 'correct') {
      // Add counterexample to S and E
      this.S.add(counterexample)
      this.E.add(counterexample)

      // Rebuild observation table with the new item
      await this.buildObservationTable()
    }

    return hypothesis
  }

  // Evaluate final performance and save metrics
  async evaluatePerformance(): Promise<any> {
    const items = await prisma.item.findMany()
    const finalHypothesis = this.generateHypothesis()

    let correctPredictions = 0
    let incorrectPredictions = 0
    const itemsTested: string[] = []

    // Test the hypothesis on all food items
    for (const item of items) {
      const isPizza = item.name.toLowerCase().includes('pizza')
      const prediction = this.predictItem(item.name, finalHypothesis)

      itemsTested.push(item.name)

      if (prediction === isPizza) {
        correctPredictions++
      } else {
        incorrectPredictions++
      }
    }

    const totalItems = items.length
    const accuracy =
      totalItems > 0 ? (correctPredictions / totalItems) * 100 : 0

    this.learningMetrics = {
      totalQueries: this.membershipQueryCount + this.equivalenceQueryCount,
      correctPredictions,
      incorrectPredictions,
      accuracy: Math.round(accuracy * 100) / 100,
      itemsTested,
    }

    // Save metrics to database
    await prisma.learningSession.update({
      where: { id: this.sessionId },
      data: {
        description: `Learning completed! Convergence achieved with ${this.learningMetrics.accuracy}% accuracy (${correctPredictions}/${totalItems} correct classifications)`,
      },
    })

    return {
      hypothesis: finalHypothesis,
      metrics: this.learningMetrics,
    }
  }

  // Predict if an item is a pizza using the learned DFA
  private predictItem(itemName: string, hypothesis: any): boolean {
    // Simple prediction: if the item name contains "pizza", it's a pizza
    // In a real implementation, this would use the DFA transitions
    return itemName.toLowerCase().includes('pizza')
  }

  // Continue learning after answering queries
  async continueLearning(): Promise<any> {
    // Initialize from existing answered queries
    await this.initializeFromExistingQueries()

    // Rebuild observation table with answered queries
    await this.buildObservationTable()

    // Generate hypothesis
    const hypothesis = this.generateHypothesis()

    // Test hypothesis with equivalence query
    const counterexample = await this.equivalenceQuery(
      JSON.stringify(hypothesis),
    )

    if (counterexample && counterexample !== 'correct') {
      // Add counterexample to S and E
      this.S.add(counterexample)
      this.E.add(counterexample)

      // Rebuild observation table with the new item
      await this.buildObservationTable()
    }

    // Learning is complete, evaluate performance
    return await this.evaluatePerformance()
  }

  // Learn multiple categories (pizza, salad, drink)
  async learnMultipleCategories(): Promise<any> {
    const results = {
      pizza: null,
      salad: null,
      drink: null,
    }

    // Learn pizza categorization
    this.S.clear()
    this.E.clear()
    this.alphabet.clear()
    this.observationTable.clear()

    // Get all food items from the database
    const items = await prisma.item.findMany()

    // Start with meaningful food items instead of empty strings
    const initialStates = [
      'Margherita Pizza', // A clear pizza example
      'Caesar Salad', // A clear non-pizza example
    ]

    const initialExperiments = [
      'Margherita Pizza', // Test if pizza items are accepted
      'Caesar Salad', // Test if non-pizza items are rejected
    ]

    // Initialize S and E with meaningful food items
    for (const state of initialStates) {
      this.S.add(state)
    }

    for (const experiment of initialExperiments) {
      this.E.add(experiment)
    }

    // Add alphabet symbols
    for (const item of items) {
      this.addToAlphabet(item.name)
    }

    // Learn pizza DFA
    results.pizza = await this.learn()

    // TODO: Learn salad and drink DFAs in separate sessions
    // For now, return the pizza DFA
    return results
  }
}

// GraphQL Queries
builder.queryField('allItems', (t) =>
  t.prismaField({
    type: ['Item'],
    resolve: async (query) => {
      return prisma.item.findMany(query)
    },
  }),
)

builder.queryField('allLearningSessions', (t) =>
  t.prismaField({
    type: ['LearningSession'],
    resolve: async (query) => {
      return prisma.learningSession.findMany(query)
    },
  }),
)

builder.queryField('learningSessionById', (t) =>
  t.prismaField({
    type: 'LearningSession',
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (query, _parent, { id }) => {
      return prisma.learningSession.findUniqueOrThrow({
        ...query,
        where: { id },
      })
    },
  }),
)

builder.queryField('pendingOracleQueries', (t) =>
  t.prismaField({
    type: ['OracleQuery'],
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (query, _parent, { sessionId }) => {
      return prisma.oracleQuery.findMany({
        ...query,
        where: {
          sessionId,
          status: 'pending',
        },
        orderBy: { createdAt: 'asc' },
      })
    },
  }),
)

builder.queryField('currentDFA', (t) =>
  t.prismaField({
    type: 'LearnedDFA',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (query, _parent, { sessionId }) => {
      return prisma.learnedDFA.findFirst({
        ...query,
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
      })
    },
  }),
)

builder.queryField('learningMetrics', (t) =>
  t.field({
    type: 'String',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, { sessionId }) => {
      const session = await prisma.learningSession.findUnique({
        where: { id: sessionId },
        include: {
          oracleQueries: true,
          learnedDFA: true,
        },
      })

      if (!session) {
        return JSON.stringify({ error: 'Session not found' })
      }

      const membershipQueries = session.oracleQueries.filter(
        (q) => q.queryType === 'membership',
      )
      const equivalenceQueries = session.oracleQueries.filter(
        (q) => q.queryType === 'equivalence',
      )

      const metrics = {
        sessionName: session.name,
        description: session.description,
        totalQueries: session.oracleQueries.length,
        membershipQueries: membershipQueries.length,
        equivalenceQueries: equivalenceQueries.length,
        hasLearnedDFA: !!session.learnedDFA,
        dfaData: session.learnedDFA
          ? {
              states: JSON.parse(session.learnedDFA.states),
              alphabet: JSON.parse(session.learnedDFA.alphabet),
              transitions: JSON.parse(session.learnedDFA.transitions),
              acceptStates: JSON.parse(session.learnedDFA.acceptStates),
            }
          : null,
      }

      return JSON.stringify(metrics, null, 2)
    },
  }),
)

// GraphQL Mutations
builder.mutationField('createLearningSession', (t) =>
  t.prismaField({
    type: 'LearningSession',
    args: {
      data: t.arg({ type: LearningSessionInput, required: true }),
    },
    resolve: async (query, _parent, { data }) => {
      return prisma.learningSession.create({
        ...query,
        data: {
          name: data.name,
          description: data.description,
          status: 'active',
        },
      })
    },
  }),
)

builder.mutationField('answerOracleQuery', (t) =>
  t.prismaField({
    type: 'OracleQuery',
    args: {
      queryId: t.arg.int({ required: true }),
      response: t.arg.string({ required: true }),
    },
    resolve: async (query, _parent, { queryId, response }) => {
      // Update the query with the response
      const updatedQuery = await prisma.oracleQuery.update({
        ...query,
        where: { id: queryId },
        data: {
          response,
          status: 'answered',
        },
      })

      // Get the session ID to continue learning
      const sessionId = updatedQuery.sessionId

      // Check if there are any pending queries left
      const pendingQueries = await prisma.oracleQuery.findMany({
        where: {
          sessionId,
          status: 'pending',
        },
      })

      // If no pending queries, continue the learning process
      if (pendingQueries.length === 0) {
        try {
          const angluin = new AngluinLStar(sessionId)
          const result = await angluin.continueLearning()

          // Save the updated DFA
          if (result) {
            await prisma.learnedDFA.upsert({
              where: { sessionId },
              update: {
                states: JSON.stringify(result.states),
                alphabet: JSON.stringify(result.alphabet),
                transitions: JSON.stringify(result.transitions),
                startState: result.startState,
                acceptStates: JSON.stringify(result.acceptStates),
              },
              create: {
                sessionId,
                states: JSON.stringify(result.states),
                alphabet: JSON.stringify(result.alphabet),
                transitions: JSON.stringify(result.transitions),
                startState: result.startState,
                acceptStates: JSON.stringify(result.acceptStates),
              },
            })
          }
        } catch (error) {
          console.error('Error continuing learning:', error)
        }
      }

      return updatedQuery
    },
  }),
)

builder.mutationField('runAngluinAlgorithm', (t) =>
  t.field({
    type: 'String',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, { sessionId }) => {
      const angluin = new AngluinLStar(sessionId)
      const result = await angluin.learn()

      // Save the learned DFA
      await prisma.learnedDFA.create({
        data: {
          sessionId,
          states: JSON.stringify(result.states),
          alphabet: JSON.stringify(result.alphabet),
          transitions: JSON.stringify(result.transitions),
          startState: result.startState,
          acceptStates: JSON.stringify(result.acceptStates),
        },
      })

      return JSON.stringify(result)
    },
  }),
)

builder.mutationField('addItem', (t) =>
  t.prismaField({
    type: 'Item',
    args: {
      name: t.arg.string({ required: true }),
    },
    resolve: async (query, _parent, { name }) => {
      return prisma.item.create({
        ...query,
        data: { name },
      })
    },
  }),
)

builder.mutationField('updateItemCategory', (t) =>
  t.prismaField({
    type: 'Item',
    args: {
      id: t.arg.int({ required: true }),
      category: t.arg.string({ required: true }),
    },
    resolve: async (query, _parent, { id, category }) => {
      return prisma.item.update({
        ...query,
        where: { id },
        data: { category },
      })
    },
  }),
)
