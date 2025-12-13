# ArcDashboard - Token Portfolio Viewer

## Overview

ArcDashboard is a Web3 portfolio dashboard that enables users to view and track their token holdings on the Arc Testnet blockchain. Similar to DeBank, users can connect their wallet to view their portfolio or search any wallet address to see its token holdings. The application displays token balances, prices (testnet mock prices), and total portfolio value.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui component library (New York style) with Radix UI primitives
- **Design Theme**: Cyberpunk/futuristic dark mode with custom fonts (Orbitron, Rajdhani, JetBrains Mono)
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API under `/api/*` prefix
- **Database ORM**: Drizzle ORM with PostgreSQL dialect

### Key Features
- **Portfolio View**: Connect wallet to see all token holdings on Arc Testnet
- **Wallet Search**: Search any wallet address to view its token holdings
- **Token Table**: Display tokens with price, amount, and USD value
- **Total Value**: Calculate and display total portfolio value
- **Real-time Data**: Fetch token data from ArcScan API and blockchain

### Data Storage
- **Primary**: Blockchain-sourced data via ArcScan API (persists across deployments)
- **Fallback Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts`

### Web3 Integration
- **Library**: ethers.js v6
- **Network**: Arc Testnet (Chain ID: 0x4CEF22 / 5042002)
- **Features**:
  - MetaMask wallet connection with automatic network switching
  - Token balance fetching via ERC-20 contract calls
  - ArcScan API integration for token list

### Project Structure
```
├── client/           # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── TokenPortfolio.tsx  # Main portfolio display component
│   │   │   ├── ConnectWallet.tsx   # Wallet connection component
│   │   │   └── ui/                 # shadcn/ui components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utilities and configs
│   │   │   └── arc-network.ts  # Arc Testnet configuration
│   │   └── pages/        # Route pages
│   │       └── home.tsx  # Main dashboard page
├── server/           # Express backend
│   ├── db.ts         # Database connection
│   ├── routes.ts     # API route handlers
│   └── storage.ts    # Data access layer
├── shared/           # Shared code between client/server
│   └── schema.ts     # Drizzle database schema
```

## External Dependencies

### Blockchain
- **Arc Testnet RPC**: `https://rpc.testnet.arc.network`
- **Block Explorer**: `https://testnet.arcscan.app`
- **ArcScan API**: `https://testnet.arcscan.app/api`
- **Native Currency**: USDC (18 decimals)

### Database
- **PostgreSQL**: Connection via `DATABASE_URL` environment variable
- **Session Store**: connect-pg-simple for Express sessions

### Required Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (required for database operations)

### Key npm Packages
- `ethers` - Ethereum/Web3 interactions
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `@tanstack/react-query` - Data fetching and caching
- `@radix-ui/*` - Accessible UI primitives
- `tailwindcss` - Utility-first CSS framework

## Recent Changes (December 2025)
- Renamed from ArcRevoke to ArcDashboard
- Removed all revoke functionality
- Added TokenPortfolio component for viewing wallet tokens
- Added wallet search functionality
- Updated UI to DeBank-style dashboard layout
- Added Portfolio tab for connected wallet view
- **UX Improvements (Dec 13, 2025)**:
  - Last update indicator showing "Last updated at HH:MM:SS (UTC)" after each refresh
  - Refresh button disabled with loading spinner during data fetch
  - Delta tracking between refreshes (absolute + percentage change) with visual cues (green up arrow / red down arrow)
  - Price transparency: each token shows price source (Fixed price, On-chain, Oracle) with timestamp