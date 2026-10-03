import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import apiRoutes from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, '..', 'public'), {
    setHeaders(res, filePath) {
        if (filePath.endsWith('index.html') || filePath.endsWith('main.js') || filePath.endsWith('firebase-app.css')) {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));
app.get(/.*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((error, req, res, next) => {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
});

export default app;