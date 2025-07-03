/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: [
        "/node_modules/",
        "/dist/"
    ],
    moduleNameMapper: {
        // 必要に応じてモジュールのマッピングを追加
    },
};