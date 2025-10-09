"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vite_1 = require("vite");
const plugin_react_1 = __importDefault(require("@vitejs/plugin-react"));
const path_1 = __importDefault(require("path"));
exports.default = (0, vite_1.defineConfig)({
    plugins: [(0, plugin_react_1.default)()],
    root: 'src/ui',
    build: {
        outDir: path_1.default.resolve(__dirname, 'dist/ui'),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path_1.default.resolve(__dirname, 'src/ui/index.html'),
            },
        },
    },
    resolve: {
        alias: {
            '@': path_1.default.resolve(__dirname, './src/ui'),
        },
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:3123',
                changeOrigin: true,
            },
            '/mcp': {
                target: 'http://localhost:3123',
                changeOrigin: true,
            },
        },
    },
});
