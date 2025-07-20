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
  private useDatabaseCategories: boolean = true // Use actual categories for accuracy
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

  // Get the target category for a session (from database or generate new)
  async getTargetCategoryForSession(): Promise<string> {
    // Check if we already have a target category stored for this session
    const existingQueries = await prisma.oracleQuery.findMany({
      where: {
        sessionId: this.sessionId,
        queryType: 'membership',
      },
      take: 1,
    })

    if (existingQueries.length > 0) {
      try {
        const queryData = JSON.parse(existingQueries[0].queryData)
        return queryData.category
      } catch (error) {
        console.error('Error parsing existing query data:', error)
      }
    }

    // If no existing queries, use the current target category
    return this.targetCategory
  }

  // Get a random category to learn
  private getRandomCategory(): string {
    const categories = [
      'pizza',
      'salad',
      'drink',
      'appetizer',
      'main',
      'dessert',
    ]
    return categories[Math.floor(Math.random() * categories.length)]
  }

  // Get examples for the current target category
  private getCategoryExamples(): any {
    const examples = {
      pizza:
        'Margherita Pizza, Pepperoni Pizza, BBQ Chicken Pizza, Hawaiian Pizza, Supreme Pizza, Veggie Pizza, Meat Lovers Pizza, Buffalo Chicken Pizza',
      salad:
        'Caesar Salad, Greek Salad, Cobb Salad, Garden Salad, Spinach Salad, Nicoise Salad, Waldorf Salad, Caprese Salad',
      drink:
        'Coke, Water, Coffee, Tea, Orange Juice, Lemonade, Milk, Beer, Wine, Smoothie',
      appetizer:
        'Garlic Bread, Chicken Wings, Mozzarella Sticks, Onion Rings, French Fries, Breadsticks, Nachos, Bruschetta',
      main: 'Grilled Chicken, Beef Burger, Fish Tacos, Pasta Carbonara, Steak, Salmon, Shrimp Scampi, Beef Tacos',
      dessert:
        'Chocolate Cake, Ice Cream, Cheesecake, Apple Pie, Tiramisu, Brownie, Chocolate Chip Cookie, Creme Brulee',
      other: 'Items from other categories that are not in the target category',
      note: "We are learning to categorize food items using Angluin's L* algorithm. The method constructs strings by combining words.",
    }

    return {
      [this.targetCategory]:
        examples[this.targetCategory as keyof typeof examples],
      ...examples,
    }
  }

  // Initialize the algorithm state from existing queries
  async initializeFromExistingQueries(): Promise<void> {
    console.log('=== Initializing from existing queries ===')

    // Get all answered queries for this session
    const answeredQueries = await prisma.oracleQuery.findMany({
      where: {
        sessionId: this.sessionId,
        status: 'answered',
      },
    })

    console.log('Found answered queries:', answeredQueries.length)
    console.log(
      'All answered queries:',
      answeredQueries.map((q) => ({
        id: q.id,
        type: q.queryType,
        data: q.queryData,
        response: q.response,
      })),
    )

    // Clear existing state
    this.S.clear()
    this.E.clear()
    this.observationTable.clear()

    // Rebuild the observation table from answered queries
    for (const query of answeredQueries) {
      if (query.queryType === 'membership') {
        try {
          const queryData = JSON.parse(query.queryData)
          const queryString = queryData.query
          // Accept multiple formats of "true" responses
          const response =
            (typeof query.response === 'string' &&
              ['true', 'True', 'TRUE', '1', 'yes', 'Yes', 'YES'].includes(
                query.response,
              )) ||
            (typeof query.response === 'boolean' && query.response === true) ||
            (typeof query.response === 'number' && query.response === 1)
              ? true
              : false

          // Debug log: print query string, raw response, and interpreted value
          console.log(
            `Query: "${queryString}", Raw response: ${query.response}, Interpreted: ${response}`,
          )

          // Add the query string to both S and E sets
          this.S.add(queryString)
          this.E.add(queryString)

          // Add to observation table - use the query string as both state and experiment
          this.setObservationTableEntry(queryString, queryString, response)
        } catch (error) {
          console.error('Error processing query:', error)
          console.error('Query data:', query.queryData)
        }
      }
    }

    // Force populate alphabet with all items
    const items = await prisma.item.findMany()
    for (const item of items) {
      this.addToAlphabet(item.name)
    }

    console.log('Final S set:', Array.from(this.S))
    console.log('Final E set:', Array.from(this.E))
    console.log('Final observation table:', this.observationTable)
    console.log('S set size after initialization:', this.S.size)
    console.log('E set size after initialization:', this.E.size)
    console.log(
      'Observation table size after initialization:',
      this.observationTable.size,
    )
    console.log('=========================================')
  }

  // Add a string to the alphabet
  addToAlphabet(str: string) {
    this.alphabet.add(str)
  }

  // Membership query - ask oracle if a string is in the target language
  async membershipQuery(s: string): Promise<boolean> {
    console.log(`=== Membership Query for "${s}" ===`)

    // Check if we already have this query in the database
    // We need to search for queries that contain this string in their queryData
    const existingQueries = await prisma.oracleQuery.findMany({
      where: {
        sessionId: this.sessionId,
        queryType: 'membership',
        status: 'answered',
      },
    })

    console.log(`Found ${existingQueries.length} existing membership queries`)

    // Find the query that matches our string
    const existingQuery = existingQueries.find((query) => {
      try {
        const queryData = JSON.parse(query.queryData)
        return queryData.query === s
      } catch {
        return false
      }
    })

    if (existingQuery) {
      console.log(
        `Found existing query for "${s}": response="${
          existingQuery.response
        }", type=${typeof existingQuery.response}`,
      )

      // More robust response parsing
      const result =
        (typeof existingQuery.response === 'string' &&
          ['true', 'True', 'TRUE', '1', 'yes', 'Yes', 'YES'].includes(
            existingQuery.response,
          )) ||
        (typeof existingQuery.response === 'boolean' &&
          existingQuery.response === true) ||
        (typeof existingQuery.response === 'number' &&
          existingQuery.response === 1)
          ? true
          : false

      console.log(`Interpreted response for "${s}": ${result}`)
      return result
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

    console.log(`Created new membership query for "${s}" with ID ${query.id}`)
    // For now, return false - the oracle will answer this
    return false
  }

  // Equivalence query - ask oracle if hypothesis is equivalent to target
  async equivalenceQuery(): Promise<string | null> {
    console.log('=== Equivalence Query ===')

    // Check if we've reached the limit for equivalence queries
    if (this.equivalenceQueryCount >= this.maxEquivalenceQueries) {
      console.log(
        `Reached limit of ${this.maxEquivalenceQueries} equivalence queries`,
      )
      return 'correct' // Assume correct when limit reached
    }

    this.equivalenceQueryCount++

    // Ensure observation table is up to date before generating hypothesis
    console.log('Ensuring observation table is up to date...')
    await this.initializeFromExistingQueries()
    await this.buildObservationTable()

    // Generate current hypothesis
    const currentHypothesis = await this.generateHypothesis()
    console.log('Current hypothesis for equivalence query:', currentHypothesis)

    // Create equivalence query with helpful context
    const queryData = {
      hypothesis: currentHypothesis,
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

    console.log(`Created equivalence query with ID ${query.id}`)
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
    console.log('=== Building Observation Table ===')
    console.log('Current S set:', Array.from(this.S))
    console.log('Current E set:', Array.from(this.E))

    // For food categorization, we ask membership queries about each food item
    for (const foodItem of Array.from(this.E)) {
      console.log(`Processing membership query for: ${foodItem}`)
      const result = await this.membershipQuery(foodItem)
      console.log(`Result for ${foodItem}: ${result}`)
      // Store the result for this food item
      this.setObservationTableEntry(foodItem, foodItem, result)
    }

    console.log('Final observation table:', this.observationTable)
    console.log('========================')
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
  async generateHypothesis(): Promise<any> {
    const states: string[] = []
    const transitions: Record<string, Record<string, string>> = {}
    const acceptStates: string[] = []

    // Create states from S (food items)
    console.log('=== Generating Hypothesis ===')
    console.log('S set size:', this.S.size)
    console.log('S set contents:', Array.from(this.S))

    // If S is empty but observation table has data, populate S from observation table
    if (this.S.size === 0 && this.observationTable.size > 0) {
      console.log(
        'S set is empty but observation table has data, populating S from observation table...',
      )
      for (const state of Array.from(this.observationTable.keys())) {
        this.S.add(state)
        console.log(`Added ${state} to S set`)
      }
    }

    for (const s of Array.from(this.S)) {
      console.log(`Adding state: ${s}`)
      states.push(s)
      transitions[s] = {}
    }

    console.log('States array after population:', states)

    // Determine which food items are in the target category based on membership queries
    console.log('Target category:', this.targetCategory)
    console.log('States (S):', Array.from(this.S))
    console.log('Experiments (E):', Array.from(this.E))
    console.log('Observation table size:', this.observationTable.size)

    // Force check database directly if observation table is empty
    if (this.observationTable.size === 0) {
      console.log('Observation table is empty, checking database directly...')
      await this.forcePopulateObservationTable()
    }

    console.log('Processing each state for acceptance:')
    for (const foodItem of Array.from(this.S)) {
      const isAccepted = this.getObservationTableEntry(foodItem, foodItem)
      console.log(`  ${foodItem}: observation table entry = ${isAccepted}`)
      if (isAccepted) {
        acceptStates.push(foodItem)
        console.log(`  ✓ Added ${foodItem} to accept states`)
      } else {
        console.log(`  ✗ ${foodItem} not accepted`)
      }
    }

    console.log('Final accept states:', acceptStates)
    console.log('Final observation table:', this.observationTable)
    console.log('Final states array:', states)
    console.log('Final transitions:', transitions)
    console.log('========================')

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

  // Force populate observation table from database
  private async forcePopulateObservationTable(): Promise<void> {
    console.log('Force populating observation table from database...')

    const answeredQueries = await prisma.oracleQuery.findMany({
      where: {
        sessionId: this.sessionId,
        queryType: 'membership',
        status: 'answered',
      },
    })

    console.log(`Found ${answeredQueries.length} answered membership queries`)

    for (const query of answeredQueries) {
      try {
        const queryData = JSON.parse(query.queryData)
        const queryString = queryData.query
        // Accept both string and boolean true as a positive answer
        const response =
          (typeof query.response === 'string' && query.response === 'true') ||
          (typeof query.response === 'boolean' && query.response === true)
            ? true
            : false

        console.log(`Force adding: "${queryString}" -> ${response}`)

        // Add to sets and observation table
        this.S.add(queryString)
        this.E.add(queryString)
        this.setObservationTableEntry(queryString, queryString, response)
      } catch (error) {
        console.error('Error in force populate:', error)
      }
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
    const hypothesis = await this.generateHypothesis()

    // Test hypothesis with equivalence query
    const counterexample = await this.equivalenceQuery()

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
    const finalHypothesis = await this.generateHypothesis()

    let correctPredictions = 0
    let incorrectPredictions = 0
    const itemsTested: string[] = []

    // Test the hypothesis on all food items
    for (const item of items) {
      const isInTargetCategory = await this.isItemInCategory(
        item.name,
        this.targetCategory,
      )
      const prediction = this.predictItem(item.name, finalHypothesis)

      itemsTested.push(item.name)

      if (prediction === isInTargetCategory) {
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
        description: `Learning completed for ${this.targetCategory} category! Convergence achieved with ${this.learningMetrics.accuracy}% accuracy (${correctPredictions}/${totalItems} correct classifications)`,
      },
    })

    return {
      hypothesis: finalHypothesis,
      metrics: this.learningMetrics,
    }
  }

  // Check if an item belongs to the target category
  private async isItemInCategory(
    itemName: string,
    category: string,
  ): Promise<boolean> {
    // If using database categories, check the actual category
    if (this.useDatabaseCategories) {
      const item = await prisma.item.findFirst({
        where: { name: itemName },
      })
      if (item && item.actualCategory) {
        return item.actualCategory === category
      }
    }

    // Fallback to string matching for pure Angluin's mode
    const itemNameLower = itemName.toLowerCase()
    switch (category) {
      case 'pizza':
        return itemNameLower.includes('pizza')
      case 'salad':
        return itemNameLower.includes('salad')
      case 'drink':
        return (
          itemNameLower.includes('coke') ||
          itemNameLower.includes('water') ||
          itemNameLower.includes('coffee') ||
          itemNameLower.includes('tea') ||
          itemNameLower.includes('juice') ||
          itemNameLower.includes('lemonade') ||
          itemNameLower.includes('milk') ||
          itemNameLower.includes('beer') ||
          itemNameLower.includes('wine') ||
          itemNameLower.includes('smoothie')
        )
      case 'appetizer':
        return (
          itemNameLower.includes('bread') ||
          itemNameLower.includes('wings') ||
          itemNameLower.includes('sticks') ||
          itemNameLower.includes('rings') ||
          itemNameLower.includes('fries') ||
          itemNameLower.includes('nachos') ||
          itemNameLower.includes('bruschetta')
        )
      case 'main':
        return (
          itemNameLower.includes('chicken') ||
          itemNameLower.includes('burger') ||
          itemNameLower.includes('tacos') ||
          itemNameLower.includes('pasta') ||
          itemNameLower.includes('steak') ||
          itemNameLower.includes('salmon') ||
          itemNameLower.includes('shrimp') ||
          itemNameLower.includes('scampi')
        )
      case 'dessert':
        return (
          itemNameLower.includes('cake') ||
          itemNameLower.includes('ice cream') ||
          itemNameLower.includes('cheesecake') ||
          itemNameLower.includes('pie') ||
          itemNameLower.includes('tiramisu') ||
          itemNameLower.includes('brownie') ||
          itemNameLower.includes('cookie') ||
          itemNameLower.includes('creme brulee')
        )
      default:
        return false
    }
  }

  // Predict if an item is in the target category using the learned DFA
  private predictItem(itemName: string, hypothesis: any): boolean {
    // Check if the item is in the accepting states of the hypothesis
    return hypothesis.acceptStates.includes(itemName)
  }

  // Continue learning after answering queries
  async continueLearning(): Promise<any> {
    console.log('=== Continue Learning ===')

    // Get the correct target category for this session
    this.targetCategory = await this.getTargetCategoryForSession()
    console.log('Using target category:', this.targetCategory)

    // Initialize from existing answered queries
    await this.initializeFromExistingQueries()

    // Ensure the observation table is fully populated from the latest answers
    await this.buildObservationTable()

    // Generate hypothesis
    const hypothesis = await this.generateHypothesis()
    console.log('Generated hypothesis in continueLearning:', hypothesis)

    // Test hypothesis with equivalence query
    const counterexample = await this.equivalenceQuery()

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

  // Public methods to access private properties
  getS(): Set<string> {
    return this.S
  }

  getObservationTable(): Map<string, Map<string, boolean>> {
    return this.observationTable
  }

  // Force populate S and E from observation table
  forcePopulateSets(): void {
    for (const state of Array.from(this.observationTable.keys())) {
      this.S.add(state)
      this.E.add(state)
    }
  }

  // Toggle between pure Angluin's mode and database-assisted mode
  setUseDatabaseCategories(use: boolean): void {
    this.useDatabaseCategories = use
  }

  // Get current mode
  getUseDatabaseCategories(): boolean {
    return this.useDatabaseCategories
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

builder.queryField('currentDFAState', (t) =>
  t.field({
    type: 'String',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, { sessionId }) => {
      try {
        console.log('=== Current DFA State Query ===')
        const angluin = new AngluinLStar(sessionId)

        // Use the same logic as equivalence query
        await angluin.initializeFromExistingQueries()
        await angluin.buildObservationTable()

        // Check if S set is still empty after initialization
        if (angluin.getS().size === 0) {
          console.log(
            'S set is still empty after initialization, forcing population from observation table...',
          )
          // Force populate S and E from observation table
          angluin.forcePopulateSets()
          console.log(
            'S set after forced population:',
            Array.from(angluin.getS()),
          )
        }

        const hypothesis = await angluin.generateHypothesis()

        console.log('Generated hypothesis for currentDFAState:', hypothesis)

        return JSON.stringify({
          states: hypothesis.states,
          alphabet: hypothesis.alphabet,
          transitions: hypothesis.transitions,
          startState: hypothesis.startState,
          acceptStates: hypothesis.acceptStates,
          targetCategory: await angluin.getTargetCategoryForSession(),
        })
      } catch (error) {
        console.error('Error getting current DFA state:', error)
        return JSON.stringify({ error: 'Failed to get DFA state' })
      }
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

      // Debug: Show all membership queries with their responses
      const debugQueries = membershipQueries.map((q) => ({
        id: q.id,
        queryData: q.queryData,
        response: q.response,
        status: q.status,
      }))

      const metrics = {
        sessionName: session.name,
        description: session.description,
        totalQueries: session.oracleQueries.length,
        membershipQueries: membershipQueries.length,
        equivalenceQueries: equivalenceQueries.length,
        hasLearnedDFA: !!session.learnedDFA,
        debugQueries: debugQueries, // Add debug info
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
builder.mutationField('startLearning', (t) =>
  t.field({
    type: 'String',
    args: {
      sessionName: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { sessionName }) => {
      // Create a new learning session
      const session = await prisma.learningSession.create({
        data: {
          name: sessionName,
          description: `Learning session for ${sessionName}`,
          status: 'active',
        },
      })

      // Initialize the Angluin algorithm
      const angluin = new AngluinLStar(session.id)

      // Start learning and get the first query
      const result = await angluin.learn()

      // Get the first pending query
      const firstQuery = await prisma.oracleQuery.findFirst({
        where: {
          sessionId: session.id,
          status: 'pending',
        },
        orderBy: { createdAt: 'asc' },
      })

      return JSON.stringify({
        sessionId: session.id,
        currentQuery: firstQuery
          ? {
              id: firstQuery.id,
              type: firstQuery.queryType,
              data: firstQuery.queryData,
            }
          : null,
        isComplete: !firstQuery,
        finalResult: !firstQuery ? result : null,
      })
    },
  }),
)

builder.mutationField('answerQuery', (t) =>
  t.field({
    type: 'String',
    args: {
      sessionId: t.arg.int({ required: true }),
      response: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { sessionId, response }) => {
      // Get the current pending query
      const currentQuery = await prisma.oracleQuery.findFirst({
        where: {
          sessionId,
          status: 'pending',
        },
        orderBy: { createdAt: 'asc' },
      })

      if (!currentQuery) {
        return JSON.stringify({
          error: 'No pending queries found',
          isComplete: true,
        })
      }

      // Answer the current query
      await prisma.oracleQuery.update({
        where: { id: currentQuery.id },
        data: {
          response,
          status: 'answered',
        },
      })

      // Check if there are more pending queries
      const remainingQueries = await prisma.oracleQuery.findMany({
        where: {
          sessionId,
          status: 'pending',
        },
      })

      if (remainingQueries.length === 0) {
        // No more queries, continue learning
        try {
          const angluin = new AngluinLStar(sessionId)
          const result = await angluin.continueLearning()

          // Save the learned DFA
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

          return JSON.stringify({
            nextQuery: null,
            isComplete: true,
            finalResult: result,
          })
        } catch (error) {
          console.error('Error continuing learning:', error)
          return JSON.stringify({
            error: 'Error continuing learning',
            isComplete: true,
          })
        }
      } else {
        // Get the next query
        const nextQuery = remainingQueries[0]
        return JSON.stringify({
          nextQuery: {
            id: nextQuery.id,
            type: nextQuery.queryType,
            data: nextQuery.queryData,
          },
          isComplete: false,
        })
      }
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
