import type { Config } from 'jest';

const config: Config = {
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', 'src'],
  moduleNameMapper: {
    //'^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@multiformats/multiaddr$': '<rootDir>/node_modules/@multiformats/multiaddr/dist/index.min.js',
  },
  roots: ['<rootDir>/src', '<rootDir>/tests'],
};

export default config;