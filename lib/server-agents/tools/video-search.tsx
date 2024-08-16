import { tool } from 'ai'
import { searchSchema } from '@/lib/schema/search'
import { ToolProps } from '.'

// Start Generation Here
export const videoSearchTool = ({ fullResponse }: ToolProps) =>
  tool({
    description: 'Search for videos from YouTube',
    parameters: searchSchema,
    execute: async ({ query }) => {
      let hasError = false

      let searchResult
      try {
        const response = await fetch('https://google.serper.dev/videos', {
          method: 'POST',
          headers: {
            'X-API-KEY': process.env.SERPER_API_KEY || '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: query })
        })
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        searchResult = await response.json()
      } catch (error) {
        console.error('Video Search API error:', error)
        hasError = true
      }

      if (hasError) {
        fullResponse = `An error occurred while searching for videos with "${query}.`
        return searchResult
      }

      return searchResult
    }
  })
