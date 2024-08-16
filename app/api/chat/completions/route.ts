import { CoreMessage, generateId, ToolResultPart } from 'ai'
import { researcher, querySuggestor } from '@/lib/server-agents'
import { AIMessage } from '@/lib/types'
import { writer } from '@/lib/server-agents/writer'
import { transformToolMessages } from '@/lib/utils'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const headersList = headers()
  const { messages: originMessages } = await req.json()
  const auth = headersList.get('Authorization')
  const apiKey = auth?.split('Bearer ')[1]

  if (apiKey !== process.env.MORPHIC_API_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!originMessages) {
    return new Response('No messages provided', { status: 400 })
  }

  const useSpecificAPI = process.env.USE_SPECIFIC_API_FOR_WRITER === 'true'
  const useOllamaProvider = !!(
    process.env.OLLAMA_MODEL && process.env.OLLAMA_BASE_URL
  )
  const maxMessages = useSpecificAPI ? 5 : useOllamaProvider ? 1 : 10

  const aiMessages: AIMessage[] = [...originMessages]
  // Get the messages from the state, filter out the tool messages
  const messages: CoreMessage[] = aiMessages
    .filter(
      message =>
        message.role !== 'tool' &&
        message.type !== 'followup' &&
        message.type !== 'related' &&
        message.type !== 'end'
    )
    .map(message => {
      const { role, content } = message
      return { role, content } as CoreMessage
    })

  async function processEvents() {
    // groupId is used to group the messages for collapse
    const groupId = generateId()

    //  Generate the answer
    let answer = ''
    let stopReason = ''
    let toolOutputs: ToolResultPart[] = []
    let errorOccurred = false

    // If useSpecificAPI is enabled, only function calls will be made
    // If not using a tool, this model generates the answer
    while (
      useSpecificAPI
        ? toolOutputs.length === 0 && answer.length === 0 && !errorOccurred
        : (stopReason !== 'stop' || answer.length === 0) && !errorOccurred
    ) {
      // Search the web and generate the answer
      const { fullResponse, hasError, toolResponses, finishReason } =
        await researcher(messages)
      stopReason = finishReason || ''
      answer = fullResponse
      toolOutputs = toolResponses
      errorOccurred = hasError

      if (toolOutputs.length > 0) {
        toolOutputs.map(output => {
          aiMessages.push({
            id: groupId,
            role: 'tool',
            content: JSON.stringify(output.result),
            name: output.toolName,
            type: 'tool'
          })
        })
      }
    }

    // If useSpecificAPI is enabled, generate the answer using the specific model
    if (useSpecificAPI && answer.length === 0 && !errorOccurred) {
      // modify the messages to be used by the specific model
      const modifiedMessages = transformToolMessages(messages)
      const latestMessages = modifiedMessages.slice(maxMessages * -1)
      const { response, hasError } = await writer(latestMessages)
      answer = response
      errorOccurred = hasError
      messages.push({
        role: 'assistant',
        content: answer
      })
    }

    if (!errorOccurred) {
      const useGoogleProvider = process.env.GOOGLE_GENERATIVE_AI_API_KEY
      const useOllamaProvider = !!(
        process.env.OLLAMA_MODEL && process.env.OLLAMA_BASE_URL
      )
      let processedMessages = messages
      // If using Google provider, we need to modify the messages
      if (useGoogleProvider) {
        processedMessages = transformToolMessages(messages)
      }
      if (useOllamaProvider) {
        processedMessages = [{ role: 'assistant', content: answer }]
      }

      aiMessages.push({
        id: groupId,
        role: 'assistant',
        content: answer,
        type: 'answer'
      })

      // Generate related queries
      const relatedQueries = await querySuggestor(processedMessages)

      const suggestions: AIMessage[] = [
        {
          id: groupId,
          role: 'assistant',
          content: JSON.stringify(relatedQueries),
          type: 'related'
        },
        {
          id: groupId,
          role: 'assistant',
          content: 'followup',
          type: 'followup'
        }
      ]

      aiMessages.push(...suggestions)
    }
  }

  await processEvents()

  return new Response(JSON.stringify({ messages }))

  // const result = await streamText({
  //   model: openai('gpt-4-turbo'),
  //   messages
  // })

  // return new StreamingTextResponse(result.toAIStream())
}
