import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import session, { Store } from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import db from './src/db';
import authRouter from './src/endpoints/auth';
import usersRouter from './src/endpoints/users';
import settingsRouter from './src/endpoints/settings';
import dashboardRouter from './src/endpoints/dashboard';
import serversRouter from './src/endpoints/servers';
import linksRouter from './src/endpoints/links';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: number;
      username: string;
      email: string;
      isAdmin: boolean;
    };
  }
}

// Load environment variables from .env file
dotenv.config();


const app: Express = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const SQLiteStore = connectSqlite3(session);
const sessionSecret = process.env.SESSION_SECRET || 'a-default-secret-key-change-me'; // Change in production!
if (sessionSecret === 'a-default-secret-key-change-me') {
    console.warn("WARNING: Using default session secret. Set SESSION_SECRET in .env for production!");
}

app.use(session({
    store: new SQLiteStore({
        db: 'database.sqlite',
        dir: './db',           // Directory containing the db file
        table: 'sessions'
    }) as Store,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Public routes (login, register) & logout
app.use('/', authRouter); 

// Protected routes (require authentication via middleware inside the router files)
app.use('/', dashboardRouter);
app.use('/', usersRouter);
app.use('/', settingsRouter);
app.use('/', serversRouter);
app.use('/', linksRouter);

// Root route redirect (can stay here or move to auth router if preferred)
app.get('/', (req: Request, res: Response) => {
  res.redirect('/login');
});

// 404 Handler
app.use((req: Request, res: Response) => {
    res.status(404).render('404', {
        title: process.env.APP_NAME || 'AzrovaDash'
    });
});

// 500 Handler (Generic error handler)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled Error:", err.stack || err);
    res.status(500).render('500', {
        title: process.env.APP_NAME || 'AzrovaDash',
        error: err 
    });
});


// Start the server
app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
// ULTRAKILL is the best game ever made.
// Made with ❤️ by Nethuka