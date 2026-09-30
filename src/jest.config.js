module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
      diagnostics: false,   // skip type-checking node_modules (they have RN JSX issues)
    }],
  },
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.ts',
    '^expo-calendar$': '<rootDir>/__mocks__/expo-calendar.ts',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.ts',
    '^expo-network$': '<rootDir>/__mocks__/expo-network.ts',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.ts',
    // calendar module is imported as a relative path from recordStore
    '^\\.\\./calendar$': '<rootDir>/__mocks__/calendar.ts',
    '^\\./calendar$': '<rootDir>/__mocks__/calendar.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(expo-sqlite|expo-file-system|expo-calendar|expo-secure-store|expo-network|expo-crypto)/)',
  ],
};
