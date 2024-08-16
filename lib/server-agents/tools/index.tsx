import { retrieveTool } from './retrieve'
import { searchTool } from './search'
import { videoSearchTool } from './video-search'

export interface ToolProps {
  fullResponse: string
}

export const getTools = ({ fullResponse }: ToolProps) => {
  const tools: any = {
    search: searchTool({
      fullResponse
    }),
    retrieve: retrieveTool({
      fullResponse
    })
  }

  if (process.env.SERPER_API_KEY) {
    tools.videoSearch = videoSearchTool({
      fullResponse
    })
  }

  return tools
}
