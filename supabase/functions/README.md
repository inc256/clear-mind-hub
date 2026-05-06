# Supabase Edge Functions

## Prompt Edge Function

The `prompt-edge-function` edge function (written in JavaScript) handles AI streaming requests for the application. It builds system prompts server-side and streams responses from OpenAI.

### Environment Variables

Set the following environment variable in your Supabase project:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### Deployment

To deploy the edge function:

```bash
# Login to Supabase (if not already logged in)
supabase login

# Deploy the function
supabase functions deploy prompt-edge-function

# Or deploy all functions
supabase functions deploy
```

### Local Development

To test locally:

```bash
# Start the local Supabase environment
supabase start

# Serve the functions locally
supabase functions serve prompt-edge-function

# Test with curl
curl -X POST 'http://localhost:54321/functions/v1/prompt-edge-function' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "problem",
    "input": "What is 2 + 2?",
    "mindset": "general"
  }'
```

### Function Parameters

The function accepts the following parameters in the request body:

- `mode` (required): "problem" | "tutor" | "research"
- `input` (required): The user's question or topic
- `mindset` (optional): "general" | "medical" | "engineering" | "lecturer" | "scientific" | "creative"
- `depth` (optional): "beginner" | "intermediate" | "advanced"
- `citationStyle` (optional): "APA" | "MLA" | "IEEE" | "AMA" (for research mode)

### Response

The function returns a server-sent events (SSE) stream with the AI response chunks.