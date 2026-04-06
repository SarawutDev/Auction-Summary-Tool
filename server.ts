import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bodyParser from 'body-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const db = new Database('database.sqlite');

  // Initialize database
  db.exec(`
    CREATE TABLE IF NOT EXISTS auction_dates (
      date TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS auction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      mainItem TEXT,
      subItem TEXT,
      winner TEXT,
      price INTEGER,
      contactLink TEXT,
      address TEXT
    );
    CREATE TABLE IF NOT EXISTS auction_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      winner TEXT,
      imageData TEXT
    );
    CREATE TABLE IF NOT EXISTS auction_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      winner TEXT,
      isPaid INTEGER,
      isPrepared INTEGER,
      isShipped INTEGER
    );
    CREATE TABLE IF NOT EXISTS auction_shipping_fees (
      date TEXT PRIMARY KEY,
      fee INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  app.use(bodyParser.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/settings/:key', (req, res) => {
    const { key } = req.params;
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    res.json({ value: row ? row.value : null });
  });

  app.post('/api/settings/:key', (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/dates', (req, res) => {
    // Get unique dates from all tables to ensure history is always complete
    const rows = db.prepare(`
      SELECT date FROM auction_dates
      UNION
      SELECT DISTINCT date FROM auction_items
      UNION
      SELECT DISTINCT date FROM auction_images
      UNION
      SELECT DISTINCT date FROM auction_statuses
      UNION
      SELECT DISTINCT date FROM auction_shipping_fees
    `).all() as { date: string }[];
    
    const dates = rows.map(r => r.date).filter(Boolean);
    
    // Calculate totals for each date
    const history = dates.map(date => {
      const result = db.prepare('SELECT SUM(price) as total FROM auction_items WHERE date = ?').get(date) as { total: number | null };
      return { date, total: result.total || 0 };
    });
    
    res.json(history.sort((a, b) => b.date.localeCompare(a.date)));
  });

  app.post('/api/dates', (req, res) => {
    const { date } = req.body;
    try {
      db.prepare('INSERT OR IGNORE INTO auction_dates (date) VALUES (?)').run(date);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/dates/:date', (req, res) => {
    const { date } = req.params;
    try {
      db.prepare('DELETE FROM auction_dates WHERE date = ?').run(date);
      db.prepare('DELETE FROM auction_items WHERE date = ?').run(date);
      db.prepare('DELETE FROM auction_images WHERE date = ?').run(date);
      db.prepare('DELETE FROM auction_statuses WHERE date = ?').run(date);
      db.prepare('DELETE FROM auction_shipping_fees WHERE date = ?').run(date);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/auction/:date', (req, res) => {
    const { date } = req.params;
    const items = db.prepare('SELECT * FROM auction_items WHERE date = ?').all(date);
    const imagesRows = db.prepare('SELECT winner, imageData FROM auction_images WHERE date = ?').all(date) as { winner: string, imageData: string }[];
    const statusesRows = db.prepare('SELECT winner, isPaid, isPrepared, isShipped FROM auction_statuses WHERE date = ?').all(date) as { winner: string, isPaid: number, isPrepared: number, isShipped: number }[];
    const feeRow = db.prepare('SELECT fee FROM auction_shipping_fees WHERE date = ?').get(date) as { fee: number } | undefined;

    const images: Record<string, string[]> = {};
    imagesRows.forEach(row => {
      if (!images[row.winner]) images[row.winner] = [];
      images[row.winner].push(row.imageData);
    });

    const statuses: Record<string, any> = {};
    statusesRows.forEach(row => {
      statuses[row.winner] = {
        isPaid: !!row.isPaid,
        isPrepared: !!row.isPrepared,
        isShipped: !!row.isShipped
      };
    });

    res.json({
      items,
      images,
      statuses,
      shippingFee: feeRow ? feeRow.fee : 50
    });
  });

  app.post('/api/auction/:date/items', (req, res) => {
    const { date } = req.params;
    const { items } = req.body;
    try {
      // Ensure date exists in auction_dates
      db.prepare('INSERT OR IGNORE INTO auction_dates (date) VALUES (?)').run(date);
      
      db.prepare('DELETE FROM auction_items WHERE date = ?').run(date);
      const insert = db.prepare('INSERT INTO auction_items (date, mainItem, subItem, winner, price, contactLink, address) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const transaction = db.transaction((items) => {
        for (const item of items) {
          insert.run(date, item.mainItem, item.subItem || null, item.winner, item.price, item.contactLink || null, item.address || null);
        }
      });
      transaction(items);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auction/:date/images', (req, res) => {
    const { date } = req.params;
    const { images } = req.body; // Record<string, string[]>
    try {
      // Ensure date exists in auction_dates
      db.prepare('INSERT OR IGNORE INTO auction_dates (date) VALUES (?)').run(date);
      
      db.prepare('DELETE FROM auction_images WHERE date = ?').run(date);
      const insert = db.prepare('INSERT INTO auction_images (date, winner, imageData) VALUES (?, ?, ?)');
      const transaction = db.transaction((imagesMap) => {
        for (const [winner, imgList] of Object.entries(imagesMap as Record<string, string[]>)) {
          for (const img of imgList) {
            insert.run(date, winner, img);
          }
        }
      });
      transaction(images);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auction/:date/statuses', (req, res) => {
    const { date } = req.params;
    const { statuses } = req.body; // Record<string, {isPaid, isPrepared, isShipped}>
    try {
      // Ensure date exists in auction_dates
      db.prepare('INSERT OR IGNORE INTO auction_dates (date) VALUES (?)').run(date);
      
      db.prepare('DELETE FROM auction_statuses WHERE date = ?').run(date);
      const insert = db.prepare('INSERT INTO auction_statuses (date, winner, isPaid, isPrepared, isShipped) VALUES (?, ?, ?, ?, ?)');
      const transaction = db.transaction((statusMap) => {
        for (const [winner, status] of Object.entries(statusMap as Record<string, any>)) {
          insert.run(date, winner, status.isPaid ? 1 : 0, status.isPrepared ? 1 : 0, status.isShipped ? 1 : 0);
        }
      });
      transaction(statuses);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auction/:date/shipping-fee', (req, res) => {
    const { date } = req.params;
    const { fee } = req.body;
    try {
      // Ensure date exists in auction_dates
      db.prepare('INSERT OR IGNORE INTO auction_dates (date) VALUES (?)').run(date);
      
      db.prepare('INSERT OR REPLACE INTO auction_shipping_fees (date, fee) VALUES (?, ?)').run(date, fee);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Backup/Restore
  app.get('/api/backup', (req, res) => {
    const backup: Record<string, any> = {};
    backup['auction_dates'] = db.prepare('SELECT * FROM auction_dates').all();
    backup['auction_items'] = db.prepare('SELECT * FROM auction_items').all();
    backup['auction_images'] = db.prepare('SELECT * FROM auction_images').all();
    backup['auction_statuses'] = db.prepare('SELECT * FROM auction_statuses').all();
    backup['auction_shipping_fees'] = db.prepare('SELECT * FROM auction_shipping_fees').all();
    backup['settings'] = db.prepare('SELECT * FROM settings').all();
    res.json(backup);
  });

  app.post('/api/restore', (req, res) => {
    const data = req.body;
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM auction_dates').run();
        db.prepare('DELETE FROM auction_items').run();
        db.prepare('DELETE FROM auction_images').run();
        db.prepare('DELETE FROM auction_statuses').run();
        db.prepare('DELETE FROM auction_shipping_fees').run();
        db.prepare('DELETE FROM settings').run();

        if (data.auction_dates) {
          const insert = db.prepare('INSERT INTO auction_dates (date) VALUES (?)');
          data.auction_dates.forEach((r: any) => insert.run(r.date));
        }
        if (data.auction_items) {
          const insert = db.prepare('INSERT INTO auction_items (date, mainItem, subItem, winner, price, contactLink, address) VALUES (?, ?, ?, ?, ?, ?, ?)');
          data.auction_items.forEach((r: any) => insert.run(r.date, r.mainItem, r.subItem, r.winner, r.price, r.contactLink, r.address));
        }
        if (data.auction_images) {
          const insert = db.prepare('INSERT INTO auction_images (date, winner, imageData) VALUES (?, ?, ?)');
          data.auction_images.forEach((r: any) => insert.run(r.date, r.winner, r.imageData));
        }
        if (data.auction_statuses) {
          const insert = db.prepare('INSERT INTO auction_statuses (date, winner, isPaid, isPrepared, isShipped) VALUES (?, ?, ?, ?, ?)');
          data.auction_statuses.forEach((r: any) => insert.run(r.date, r.winner, r.isPaid, r.isPrepared, r.isShipped));
        }
        if (data.auction_shipping_fees) {
          const insert = db.prepare('INSERT INTO auction_shipping_fees (date, fee) VALUES (?, ?)');
          data.auction_shipping_fees.forEach((r: any) => insert.run(r.date, r.fee));
        }
        if (data.settings) {
          const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
          data.settings.forEach((r: any) => insert.run(r.key, r.value));
        }
      })();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
