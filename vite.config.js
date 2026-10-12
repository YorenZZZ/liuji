import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()], server:{port:5196, proxy:{'/api':'http://127.0.0.1:18910','/mcp':'http://127.0.0.1:18910'}}, build:{chunkSizeWarningLimit:800}});
