import Anthropic from '@anthropic-ai/sdk'

const key = process.env.ANTHROPIC_API_KEY
if (!key && process.env.NODE_ENV === 'production') {
  throw new Error('ANTHROPIC_API_KEY is required in production')
}

export const anthropic = key
  ? new Anthropic({
      apiKey: key,
      defaultHeaders: {
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
    })
  : null
