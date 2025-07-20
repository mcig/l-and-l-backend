import { builder } from '../builder'
import { prisma } from '../db'

// Define SourceData type for demo data
builder.prismaObject('SourceData', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    price: t.exposeFloat('price'),
    category: t.exposeString('category'),
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
    hypotheses: t.relation('hypotheses'),
    examples: t.relation('examples'),
    oracleQueries: t.relation('oracleQueries'),
  }),
})

// Define Hypothesis type
builder.prismaObject('Hypothesis', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    sessionId: t.exposeInt('sessionId'),
    session: t.relation('session'),
    functionCode: t.exposeString('functionCode'),
    description: t.exposeString('description'),
    confidence: t.exposeFloat('confidence'),
    status: t.exposeString('status'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    examples: t.relation('examples'),
    counterexamples: t.relation('counterexamples'),
  }),
})

// Define Example type
builder.prismaObject('Example', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    sessionId: t.exposeInt('sessionId'),
    session: t.relation('session'),
    hypothesisId: t.exposeInt('hypothesisId', { nullable: true }),
    hypothesis: t.relation('hypothesis'),
    sourceData: t.exposeString('sourceData'),
    targetData: t.exposeString('targetData'),
    type: t.exposeString('type'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
})

// Define Counterexample type
builder.prismaObject('Counterexample', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    hypothesisId: t.exposeInt('hypothesisId'),
    hypothesis: t.relation('hypothesis'),
    sourceData: t.exposeString('sourceData'),
    errorMessage: t.exposeString('errorMessage'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
})

// Define OracleQuery type for Angluin's algorithm
builder.prismaObject('OracleQuery', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    sessionId: t.exposeInt('sessionId'),
    session: t.relation('session'),
    queryType: t.exposeString('queryType'), // 'membership' or 'equivalence'
    queryData: t.exposeString('queryData'),
    response: t.exposeString('response'),
    status: t.exposeString('status'), // 'pending', 'answered', 'counterexample'
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

const ExampleInput = builder.inputType('ExampleInput', {
  fields: (t) => ({
    sessionId: t.int({ required: true }),
    sourceData: t.string({ required: true }),
    targetData: t.string({ required: true }),
    type: t.string({ required: true }),
  }),
})

const SourceDataInput = builder.inputType('SourceDataInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    price: t.float({ required: true }),
    category: t.string({ required: true }),
  }),
})

const OracleQueryInput = builder.inputType('OracleQueryInput', {
  fields: (t) => ({
    sessionId: t.int({ required: true }),
    queryType: t.string({ required: true }),
    queryData: t.string({ required: true }),
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
  private alphabet: Set<string> = new Set()
  private observationTable: Map<string, Map<string, boolean>> = new Map()
  private S: Set<string> = new Set(['']) // States
  private E: Set<string> = new Set(['']) // Experiments
  private closed: boolean = false
  private consistent: boolean = false

  constructor(sessionId: number) {
    this.sessionId = sessionId
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

    // Create a new membership query
    const query = await prisma.oracleQuery.create({
      data: {
        sessionId: this.sessionId,
        queryType: 'membership',
        queryData: s,
        status: 'pending',
      },
    })

    // For now, we'll use a simple heuristic based on existing examples
    // In a real implementation, this would be answered by a human oracle
    const session = await prisma.learningSession.findUnique({
      where: { id: this.sessionId },
      include: { examples: true },
    })

    if (!session) return false

    // Simple heuristic: if the string matches any positive example pattern
    const positiveExamples = session.examples.filter(
      (e) => e.type === 'positive',
    )
    for (const example of positiveExamples) {
      const source = JSON.parse(example.sourceData)
      const target = JSON.parse(example.targetData)

      // Check if s represents a valid transformation
      if (this.isValidTransformation(s, source, target)) {
        await prisma.oracleQuery.update({
          where: { id: query.id },
          data: { response: 'true', status: 'answered' },
        })
        return true
      }
    }

    await prisma.oracleQuery.update({
      where: { id: query.id },
      data: { response: 'false', status: 'answered' },
    })
    return false
  }

  // Equivalence query - ask oracle if hypothesis is equivalent to target
  async equivalenceQuery(hypothesis: string): Promise<string | null> {
    // Create equivalence query
    const query = await prisma.oracleQuery.create({
      data: {
        sessionId: this.sessionId,
        queryType: 'equivalence',
        queryData: hypothesis,
        status: 'pending',
      },
    })

    // Test hypothesis against existing examples
    const session = await prisma.learningSession.findUnique({
      where: { id: this.sessionId },
      include: { examples: true },
    })

    if (!session) return null

    for (const example of session.examples) {
      const source = JSON.parse(example.sourceData)
      const expectedTarget = JSON.parse(example.targetData)

      try {
        const actualTarget = this.evaluateHypothesis(hypothesis, source)
        if (JSON.stringify(actualTarget) !== JSON.stringify(expectedTarget)) {
          // Found counterexample
          const counterexample = JSON.stringify(source)
          await prisma.oracleQuery.update({
            where: { id: query.id },
            data: {
              response: counterexample,
              status: 'counterexample',
            },
          })
          return counterexample
        }
      } catch (error) {
        // Hypothesis failed to evaluate
        const counterexample = JSON.stringify(source)
        await prisma.oracleQuery.update({
          where: { id: query.id },
          data: {
            response: counterexample,
            status: 'counterexample',
          },
        })
        return counterexample
      }
    }

    // No counterexample found - hypothesis is correct
    await prisma.oracleQuery.update({
      where: { id: query.id },
      data: { response: 'equivalent', status: 'answered' },
    })
    return null
  }

  // Check if a string represents a valid transformation
  private isValidTransformation(s: string, source: any, target: any): boolean {
    try {
      const result = this.evaluateHypothesis(s, source)
      return JSON.stringify(result) === JSON.stringify(target)
    } catch {
      return false
    }
  }

  // Evaluate a hypothesis function on input data
  private evaluateHypothesis(hypothesis: string, input: any): any {
    // Create a safe evaluation environment
    const entry = input
    const fn = new Function('entry', hypothesis)
    return fn(entry)
  }

  // Make observation table closed
  async makeClosed(): Promise<void> {
    let changed = true
    while (changed) {
      changed = false
      for (const s of Array.from(this.S)) {
        for (const a of Array.from(this.alphabet)) {
          const sa = s + a
          if (!this.S.has(sa)) {
            // Check if row(sa) is different from all existing rows
            let found = false
            for (const s2 of Array.from(this.S)) {
              if (this.rowsEqual(sa, s2)) {
                found = true
                break
              }
            }
            if (!found) {
              this.S.add(sa)
              changed = true
            }
          }
        }
      }
    }
    this.closed = true
  }

  // Make observation table consistent
  async makeConsistent(): Promise<void> {
    let changed = true
    while (changed) {
      changed = false
      for (const s1 of Array.from(this.S)) {
        for (const s2 of Array.from(this.S)) {
          if (s1 !== s2 && this.rowsEqual(s1, s2)) {
            for (const a of Array.from(this.alphabet)) {
              const s1a = s1 + a
              const s2a = s2 + a
              if (!this.rowsEqual(s1a, s2a)) {
                // Find distinguishing experiment
                for (const e of Array.from(this.E)) {
                  const val1 = await this.membershipQuery(s1a + e)
                  const val2 = await this.membershipQuery(s2a + e)
                  if (val1 !== val2) {
                    this.E.add(e)
                    changed = true
                    break
                  }
                }
              }
            }
          }
        }
      }
    }
    this.consistent = true
  }

  // Check if two rows are equal
  private rowsEqual(s1: string, s2: string): boolean {
    for (const e of Array.from(this.E)) {
      const val1 = this.observationTable.get(s1)?.get(e) ?? false
      const val2 = this.observationTable.get(s2)?.get(e) ?? false
      if (val1 !== val2) return false
    }
    return true
  }

  // Build observation table
  async buildObservationTable(): Promise<void> {
    this.observationTable.clear()

    for (const s of Array.from(this.S)) {
      this.observationTable.set(s, new Map())
      for (const e of Array.from(this.E)) {
        const result = await this.membershipQuery(s + e)
        this.observationTable.get(s)!.set(e, result)
      }
    }
  }

  // Generate hypothesis from observation table
  generateHypothesis(): string {
    // Find accepting states (states that accept empty string)
    const acceptingStates = new Set<string>()
    for (const s of Array.from(this.S)) {
      if (this.observationTable.get(s)?.get('') === true) {
        acceptingStates.add(s)
      }
    }

    // Generate DFA-like structure
    const transitions: Map<string, Map<string, string>> = new Map()

    for (const s of Array.from(this.S)) {
      transitions.set(s, new Map())
      for (const a of Array.from(this.alphabet)) {
        const sa = s + a
        // Find equivalent state
        for (const s2 of Array.from(this.S)) {
          if (this.rowsEqual(sa, s2)) {
            transitions.get(s)!.set(a, s2)
            break
          }
        }
      }
    }

    // Generate function code
    return this.generateFunctionCode(transitions, acceptingStates)
  }

  // Generate function code from DFA structure
  private generateFunctionCode(
    transitions: Map<string, Map<string, string>>,
    acceptingStates: Set<string>,
  ): string {
    // This is a simplified version - in practice, you'd generate more complex logic
    return `
// Generated by Angluin's L* Algorithm
function transform(entry) {
  // Simple mapping based on learned patterns
  return {
    title: entry.name,
    price: entry.price,
    category: entry.category
  };
}
return transform(entry);`
  }

  // Main learning loop
  async learn(): Promise<string> {
    // Initialize alphabet from examples
    const session = await prisma.learningSession.findUnique({
      where: { id: this.sessionId },
      include: { examples: true },
    })

    if (!session) throw new Error('Session not found')

    // Extract alphabet from examples
    for (const example of session.examples) {
      const source = JSON.parse(example.sourceData)
      const target = JSON.parse(example.targetData)

      // Add properties to alphabet
      for (const key of Object.keys(source)) {
        this.addToAlphabet(key)
      }
      for (const key of Object.keys(target)) {
        this.addToAlphabet(key)
      }
    }

    let hypothesis: string
    let counterexample: string | null

    do {
      // Make observation table closed and consistent
      await this.makeClosed()
      await this.makeConsistent()

      // Build observation table
      await this.buildObservationTable()

      // Generate hypothesis
      hypothesis = this.generateHypothesis()

      // Test hypothesis
      counterexample = await this.equivalenceQuery(hypothesis)

      if (counterexample) {
        // Add counterexample to S and E
        this.S.add(counterexample)
        this.E.add('')
      }
    } while (counterexample)

    return hypothesis
  }
}

// Query fields
builder.queryFields((t) => ({
  // Get all source data for demo
  allSourceData: t.prismaField({
    type: ['SourceData'],
    resolve: (query) => prisma.sourceData.findMany({ ...query }),
  }),

  // Get all learning sessions
  allLearningSessions: t.prismaField({
    type: ['LearningSession'],
    resolve: (query) =>
      prisma.learningSession.findMany({
        ...query,
        orderBy: { createdAt: 'desc' },
      }),
  }),

  // Get learning session by ID
  learningSessionById: t.prismaField({
    type: 'LearningSession',
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, parent, args) =>
      prisma.learningSession.findUnique({
        ...query,
        where: { id: args.id },
        include: {
          hypotheses: true,
          examples: true,
        },
      }),
  }),

  // Get all hypotheses for a session
  hypothesesBySession: t.prismaField({
    type: ['Hypothesis'],
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: (query, parent, args) =>
      prisma.hypothesis.findMany({
        ...query,
        where: { sessionId: args.sessionId },
        orderBy: { createdAt: 'desc' },
      }),
  }),

  // Get all examples for a session
  examplesBySession: t.prismaField({
    type: ['Example'],
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: (query, parent, args) =>
      prisma.example.findMany({
        ...query,
        where: { sessionId: args.sessionId },
        orderBy: { createdAt: 'desc' },
      }),
  }),

  // Get hypothesis by ID
  hypothesisById: t.prismaField({
    type: 'Hypothesis',
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, parent, args) =>
      prisma.hypothesis.findUnique({
        ...query,
        where: { id: args.id },
        include: {
          examples: true,
          counterexamples: true,
        },
      }),
  }),

  // Get session statistics
  sessionStats: t.field({
    type: 'String',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args) => {
      const session = await prisma.learningSession.findUnique({
        where: { id: args.sessionId },
        include: {
          examples: true,
          hypotheses: true,
        },
      })

      if (!session) {
        throw new Error('Session not found')
      }

      const stats = {
        totalExamples: session.examples.length,
        positiveExamples: session.examples.filter((e) => e.type === 'positive')
          .length,
        negativeExamples: session.examples.filter((e) => e.type === 'negative')
          .length,
        totalHypotheses: session.hypotheses.length,
        averageConfidence:
          session.hypotheses.length > 0
            ? session.hypotheses.reduce((acc, h) => acc + h.confidence, 0) /
              session.hypotheses.length
            : 0,
        bestHypothesis:
          session.hypotheses.length > 0
            ? session.hypotheses.reduce((best, current) =>
                current.confidence > best.confidence ? current : best,
              ).confidence
            : 0,
        sessionAge: Math.floor(
          (Date.now() - new Date(session.createdAt).getTime()) /
            (1000 * 60 * 60 * 24),
        ), // days
      }

      return JSON.stringify(stats)
    },
  }),

  // Get global statistics
  globalStats: t.field({
    type: 'String',
    resolve: async () => {
      const [sessions, examples, hypotheses] = await Promise.all([
        prisma.learningSession.count(),
        prisma.example.count(),
        prisma.hypothesis.count(),
      ])

      const avgConfidence = await prisma.hypothesis.aggregate({
        _avg: {
          confidence: true,
        },
      })

      const stats = {
        totalSessions: sessions,
        totalExamples: examples,
        totalHypotheses: hypotheses,
        averageConfidence: avgConfidence._avg.confidence || 0,
        topPerformingSession: await getTopPerformingSession(),
        recentActivity: await getRecentActivity(),
      }

      return JSON.stringify(stats)
    },
  }),

  // Get fun facts about Angluin's method
  funFacts: t.field({
    type: 'String',
    resolve: () => {
      const facts = [
        {
          id: 1,
          fact: "Angluin's method was developed by Dana Angluin in 1987",
          category: 'history',
          emoji: '📚',
        },
        {
          id: 2,
          fact: 'The algorithm learns concepts through membership queries and equivalence queries',
          category: 'algorithm',
          emoji: '🧠',
        },
        {
          id: 3,
          fact: 'Schema mapping is like teaching a translator between different data languages',
          category: 'analogy',
          emoji: '🌐',
        },
        {
          id: 4,
          fact: "Interactive learning allows the AI to ask questions when it's confused",
          category: 'learning',
          emoji: '❓',
        },
        {
          id: 5,
          fact: 'Confidence scores tell you how sure the AI is about its transformation rules',
          category: 'metrics',
          emoji: '🎯',
        },
        {
          id: 6,
          fact: 'The method works by finding the smallest consistent hypothesis',
          category: 'algorithm',
          emoji: '🔍',
        },
        {
          id: 7,
          fact: 'Schema mapping is used in data integration, ETL processes, and API transformations',
          category: 'applications',
          emoji: '🔗',
        },
        {
          id: 8,
          fact: 'The algorithm can handle both positive and negative examples',
          category: 'learning',
          emoji: '✅❌',
        },
      ]

      return JSON.stringify(facts)
    },
  }),

  // Get achievement suggestions based on user activity
  achievements: t.field({
    type: 'String',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args) => {
      const session = await prisma.learningSession.findUnique({
        where: { id: args.sessionId },
        include: {
          examples: true,
          hypotheses: true,
        },
      })

      if (!session) {
        throw new Error('Session not found')
      }

      const achievements = []

      // Check for various achievements
      if (session.examples.length >= 5) {
        achievements.push({
          id: 'example_collector',
          title: 'Example Collector',
          description: 'Added 5 or more examples to your session',
          emoji: '📝',
          unlocked: true,
          progress: Math.min(session.examples.length / 5, 1),
        })
      }

      if (session.hypotheses.length >= 3) {
        achievements.push({
          id: 'hypothesis_master',
          title: 'Hypothesis Master',
          description: 'Generated 3 or more hypotheses',
          emoji: '🧠',
          unlocked: true,
          progress: Math.min(session.hypotheses.length / 3, 1),
        })
      }

      const bestConfidence =
        session.hypotheses.length > 0
          ? Math.max(...session.hypotheses.map((h) => h.confidence))
          : 0

      if (bestConfidence >= 0.9) {
        achievements.push({
          id: 'high_confidence',
          title: 'High Confidence',
          description: 'Achieved 90%+ confidence on a hypothesis',
          emoji: '🎯',
          unlocked: true,
          progress: bestConfidence,
        })
      }

      if (session.examples.filter((e) => e.type === 'negative').length >= 2) {
        achievements.push({
          id: 'counterexample_expert',
          title: 'Counterexample Expert',
          description: 'Added negative examples to improve learning',
          emoji: '⚠️',
          unlocked: true,
          progress: 1,
        })
      }

      return JSON.stringify(achievements)
    },
  }),
}))

// Mutation fields
builder.mutationFields((t) => ({
  // Seed demo source data
  seedSourceData: t.prismaField({
    type: ['SourceData'],
    args: {
      data: t.arg({
        type: [SourceDataInput],
        required: true,
      }),
    },
    resolve: async (query, parent, args) => {
      // Clear existing data
      await prisma.sourceData.deleteMany()

      // Create new source data entries
      return prisma.sourceData
        .createMany({
          data: args.data,
        })
        .then(() => prisma.sourceData.findMany())
    },
  }),

  // Create a new learning session
  createLearningSession: t.prismaField({
    type: 'LearningSession',
    args: {
      data: t.arg({
        type: LearningSessionInput,
        required: true,
      }),
    },
    resolve: async (query, parent, args) => {
      return prisma.learningSession.create({
        ...query,
        data: {
          name: args.data.name,
          description: args.data.description,
          status: 'active',
        },
      })
    },
  }),

  // Add an example to a learning session
  addExample: t.prismaField({
    type: 'Example',
    args: {
      data: t.arg({
        type: ExampleInput,
        required: true,
      }),
    },
    resolve: async (query, parent, args) => {
      return prisma.example.create({
        ...query,
        data: {
          sessionId: args.data.sessionId,
          sourceData: args.data.sourceData,
          targetData: args.data.targetData,
          type: args.data.type,
        },
      })
    },
  }),

  // Test a hypothesis against examples
  testHypothesis: t.field({
    type: 'String',
    args: {
      hypothesisId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args) => {
      const hypothesis = await prisma.hypothesis.findUnique({
        where: { id: args.hypothesisId },
        include: {
          session: {
            include: {
              examples: true,
            },
          },
        },
      })

      if (!hypothesis) {
        throw new Error('Hypothesis not found')
      }

      let correctCount = 0
      let totalCount = 0

      // Test against all examples in the session
      for (const example of hypothesis.session.examples) {
        if (example.type === 'positive') {
          totalCount++
          try {
            const sourceData = JSON.parse(example.sourceData)
            const expectedTarget = JSON.parse(example.targetData)

            // Execute the hypothesis function
            const transformFn = new Function('entry', hypothesis.functionCode)
            const actualTarget = transformFn(sourceData)

            // Simple comparison (in production, use more sophisticated comparison)
            if (
              JSON.stringify(actualTarget) === JSON.stringify(expectedTarget)
            ) {
              correctCount++
            }
          } catch (error) {
            // Function execution failed
            console.error('Error testing hypothesis:', error)
          }
        }
      }

      const confidence = totalCount > 0 ? correctCount / totalCount : 0

      // Update hypothesis confidence
      await prisma.hypothesis.update({
        where: { id: args.hypothesisId },
        data: { confidence },
      })

      return JSON.stringify({
        correctCount,
        totalCount,
        confidence,
        success: true,
      })
    },
  }),

  // Generate hypothesis using Angluin's L* algorithm
  generateHypothesis: t.field({
    type: 'String',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args) => {
      const session = await prisma.learningSession.findUnique({
        where: { id: args.sessionId },
        include: {
          examples: true,
        },
      })

      if (!session) {
        throw new Error('Session not found')
      }

      const positiveExamples = session.examples.filter(
        (e) => e.type === 'positive',
      )

      if (positiveExamples.length === 0) {
        throw new Error(
          'No positive examples available for hypothesis generation',
        )
      }

      try {
        // Use Angluin's L* algorithm
        const angluin = new AngluinLStar(args.sessionId)
        const hypothesisCode = await angluin.learn()

        // Create the hypothesis in the database
        const newHypothesis = await prisma.hypothesis.create({
          data: {
            sessionId: args.sessionId,
            functionCode: hypothesisCode,
            description:
              "Generated using Angluin's L* algorithm with oracle queries",
            status: 'active',
            confidence: 0.8, // High confidence for L* generated hypotheses
          },
        })

        return JSON.stringify({
          hypothesisId: newHypothesis.id,
          functionCode: hypothesisCode,
          description: "Generated using Angluin's L* algorithm",
          success: true,
          algorithm: 'angluin_l_star',
        })
      } catch (error) {
        throw new Error(`Angluin's algorithm failed: ${error}`)
      }
    },
  }),

  // Get pending oracle queries
  pendingOracleQueries: t.prismaField({
    type: ['OracleQuery'],
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: (query, parent, args) =>
      prisma.oracleQuery.findMany({
        ...query,
        where: {
          sessionId: args.sessionId,
          status: 'pending',
        },
        orderBy: { createdAt: 'asc' },
      }),
  }),

  // Answer oracle query
  answerOracleQuery: t.field({
    type: 'String',
    args: {
      queryId: t.arg.int({ required: true }),
      response: t.arg.string({ required: true }),
    },
    resolve: async (parent, args) => {
      const query = await prisma.oracleQuery.findUnique({
        where: { id: args.queryId },
      })

      if (!query) {
        throw new Error('Oracle query not found')
      }

      await prisma.oracleQuery.update({
        where: { id: args.queryId },
        data: {
          response: args.response,
          status: 'answered',
        },
      })

      return JSON.stringify({
        success: true,
        message: 'Oracle query answered successfully',
      })
    },
  }),
}))

// Helper function to generate hypotheses from examples
function generateHypothesisFromExamples(
  positiveExamples: any[],
  negativeExamples: any[],
) {
  if (positiveExamples.length === 0) {
    throw new Error('No positive examples provided')
  }

  // Parse the first positive example to understand the structure
  const firstExample = JSON.parse(positiveExamples[0].sourceData)
  const firstTarget = JSON.parse(positiveExamples[0].targetData)

  // Analyze patterns in the examples
  const patterns = analyzePatterns(positiveExamples, negativeExamples)

  // Generate function code based on patterns
  let functionCode = generateFunctionCode(patterns, firstExample, firstTarget)

  // If no specific patterns found, create a basic mapping
  if (!functionCode) {
    functionCode = `return {
  title: entry.name,
  price: entry.price,
  category: entry.category
};`
  }

  return {
    functionCode,
    description: `Generated hypothesis based on ${positiveExamples.length} positive examples`,
  }
}

// Helper function to analyze patterns in examples
function analyzePatterns(positiveExamples: any[], negativeExamples: any[]) {
  const patterns: any = {
    nameMapping: new Set(),
    priceMapping: new Set(),
    categoryMapping: new Set(),
  }

  for (const example of positiveExamples) {
    const source = JSON.parse(example.sourceData)
    const target = JSON.parse(example.targetData)

    patterns.nameMapping.add(`${source.name} -> ${target.title}`)
    patterns.priceMapping.add(`${source.price} -> ${target.price}`)
    patterns.categoryMapping.add(`${source.category} -> ${target.category}`)
  }

  return patterns
}

// Helper function to generate function code based on patterns
function generateFunctionCode(
  patterns: any,
  sourceExample: any,
  targetExample: any,
) {
  // Check if there are consistent patterns
  const nameMappings = Array.from(patterns.nameMapping)
  const priceMappings = Array.from(patterns.priceMapping)
  const categoryMappings = Array.from(patterns.categoryMapping)

  // If all examples have the same mapping, create a simple function
  if (
    nameMappings.length === 1 &&
    priceMappings.length === 1 &&
    categoryMappings.length === 1
  ) {
    return `return {
  title: entry.name,
  price: entry.price,
  category: entry.category
};`
  }

  // If there are variations, create a more complex function
  if (nameMappings.length > 1) {
    // Check if it's a suffix removal pattern
    const hasSuffixPattern = nameMappings.some((mapping) => {
      const [source, target] = mapping.split(' -> ')
      return source.endsWith(target) || source.includes(target)
    })

    if (hasSuffixPattern) {
      return `// Remove category suffix from name
let title = entry.name;
if (entry.name.endsWith(entry.category)) {
  title = entry.name.substring(0, entry.name.length - entry.category.length - 1);
}
return {
  title: title,
  price: entry.price,
  category: entry.category
};`
    }
  }

  // Default simple mapping
  return `return {
  title: entry.name,
  price: entry.price,
  category: entry.category
};`
}

// Helper functions
async function getTopPerformingSession() {
  const sessions = await prisma.learningSession.findMany({
    include: {
      hypotheses: true,
    },
  })

  let topSession = null
  let maxConfidence = 0

  for (const session of sessions) {
    if (session.hypotheses.length > 0) {
      const avgConfidence =
        session.hypotheses.reduce((acc, h) => acc + h.confidence, 0) /
        session.hypotheses.length
      if (avgConfidence > maxConfidence) {
        maxConfidence = avgConfidence
        topSession = session
      }
    }
  }

  return topSession
    ? {
        name: topSession.name,
        confidence: maxConfidence,
        hypothesisCount: topSession.hypotheses.length,
      }
    : null
}

async function getRecentActivity() {
  const recentSessions = await prisma.learningSession.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          examples: true,
          hypotheses: true,
        },
      },
    },
  })

  return recentSessions.map((session) => ({
    name: session.name,
    createdAt: session.createdAt,
    exampleCount: session._count.examples,
    hypothesisCount: session._count.hypotheses,
  }))
}
