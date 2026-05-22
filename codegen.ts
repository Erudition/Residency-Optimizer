import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  // Schema source: introspect from the running backend
  // Use VITE_API_URL env var, fallback to local dev
  schema: process.env.VITE_API_URL
    ? `${process.env.VITE_API_URL}/api/graphql`
    : 'http://localhost:3000/api/graphql',
  documents: ['services/api/**/*.ts'],
  generates: {
    'services/api/generated.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
      ],
      config: {
        // Use string scalars for Payload's custom types
        scalars: {
          DateTime: 'string',
          JSON: 'Record<string, unknown>',
          JSONObject: 'Record<string, unknown>',
          EmailAddress: 'string',
        },
        // Don't generate enum types — we use plain strings
        enumsAsTypes: true,
        // Skip __typename in types
        skipTypename: true,
        // Make optional fields use the `?` syntax
        avoidOptionals: false,
      },
    },
  },
  ignoreNoDocuments: true,
}

export default config
