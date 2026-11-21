import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { initDatabase } from './server/database.ts';
import { registerRoutes, UPLOADS_DIR } from './server/routes.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function startServer() {
  initDatabase();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded complaint photos with strict path confinement
  app.get('/uploads/:filename', (req, res) => {
    const filename = path.basename(req.params.filename || '');
    const resolvedPath = path.resolve(UPLOADS_DIR, filename);
    if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'Uploaded file not found.' });
      return;
    }
    res.sendFile(resolvedPath);
  });

  registerRoutes(app);

  if (IS_PRODUCTION) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CivicLens server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CivicLens server:', err);
  process.exit(1);
});
