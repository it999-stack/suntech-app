// jest.config.js
//
// moduleNameMapper mirrors tsconfig.json's `paths` exactly — Jest doesn't
// share Metro's built-in tsconfig-paths resolution, so it needs its own map.
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@navigation/(.*)$': '<rootDir>/src/navigation/$1',
    '^@repositories/(.*)$': '<rootDir>/src/repositories/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@state/(.*)$': '<rootDir>/src/state/$1',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@app-types/(.*)$': '<rootDir>/src/types/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@sync/(.*)$': '<rootDir>/src/sync/$1',
    '^@db/(.*)$': '<rootDir>/src/db/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
  },
};
