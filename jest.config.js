const jestConfig = {
  testEnvironment: 'node',
  collectCoverageFrom: ['api.js', 'app.js', '!**/node_modules/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
}

module.exports = jestConfig
