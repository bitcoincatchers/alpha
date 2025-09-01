# 🧪 AlphaBot Development Setup

## 🚀 Quick Start for Collaborators

### **Prerequisites**
- Node.js 18+ 
- Git
- Code editor (VS Code recommended)

### **1. Fork & Clone**
```bash
# Fork the repo on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/alpha.git
cd alpha
npm install
```

### **2. Environment Setup**
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your test configurations
nano .env  # or your preferred editor
```

### **3. Create Test Bot (Important!)**
```bash
# 1. Message @BotFather on Telegram
# 2. Send: /newbot
# 3. Name: "YourName AlphaBot Test"
# 4. Username: "yourname_alphabot_test_bot"  
# 5. Copy token to .env file
```

### **4. Generate Test Wallet**
```bash
# Option A: Use Solana CLI
solana-keygen new --outfile test-wallet.json
solana address -k test-wallet.json

# Option B: Use online generator (devnet only!)
# Visit: https://solana-tools.vercel.app/
# Generate keypair for DEVNET testing
```

### **5. Get Test SOL**
```bash
# Airdrop devnet SOL for testing
solana airdrop 2 YOUR_TEST_WALLET_ADDRESS --url devnet

# Alternative: Use faucet
# Visit: https://faucet.solana.com/
```

## 🛡️ **Safety Measures**

### **Separate Everything from Production**
- ✅ Different Telegram bot
- ✅ Different database file  
- ✅ Devnet/Testnet (not mainnet)
- ✅ Test wallet (not production wallet)
- ✅ Different port (3001 vs 3000)

### **Simulation Mode**
The bot includes simulation mode for safe testing:

```javascript
// In your .env file:
SIMULATION_MODE=true
DEBUG_MODE=true
```

This will:
- 📊 Show all signals and analysis
- 🚫 Block all real trades
- 📝 Log what WOULD happen
- 💰 Track virtual profits/losses

## 🧪 **Testing Workflow**

### **1. Start Development Server**
```bash
# Start all services
npm run dev

# Or start individually:
npm run server:dev  # Main server on port 3001
npm run bot:dev     # Telegram bot (test mode)
```

### **2. Test with Fake Data**
```bash
# Test endpoints
curl http://localhost:3001/api/positions/filter-test/testuser
curl http://localhost:3001/api/debug/position/TEST

# Monitor logs
npm run logs        # or pm2 logs
```

### **3. Send Test Signals**
```bash
# Message your test bot with:
"🚀 BUY SIGNAL
Token: TEST
Contract: 11111111111111111111111111111112  
MC Target: $50000
Action: BUY"
```

## 📊 **Development Features**

### **Mock Trading Mode**
```javascript
// Add to .env:
MOCK_TRADING=true

// This enables:
// - Virtual wallet balances
// - Fake Jupiter swaps  
// - Simulated P&L tracking
// - No real blockchain interaction
```

### **Debug Endpoints**
- `GET /api/debug/positions` - All positions with debug info
- `GET /api/debug/signals` - Recent signal processing
- `GET /api/debug/wallet` - Wallet simulation status  
- `GET /api/health` - System health check

### **Hot Reload**
```bash
# Auto-restart on file changes
npm install -g nodemon
nodemon main_server.js

# Or use PM2 watch mode
pm2 start ecosystem.config.js --watch
```

## 🔧 **Common Development Tasks**

### **Reset Test Database**
```bash
rm test_alphabot_signals.db
npm run init:db
```

### **Add Test Data**
```bash
npm run seed:test  # Adds sample positions/signals
```

### **Run Tests**
```bash
npm test                    # Unit tests
npm run test:integration   # API tests
npm run test:trading       # Trading logic tests
```

## 🚨 **Important Warnings**

### **NEVER in Development:**
- ❌ Use production Telegram bot token
- ❌ Use production wallet private key
- ❌ Use mainnet RPC URL
- ❌ Set AUTO_TRADE_AMOUNT > 0.01 SOL
- ❌ Turn off SIMULATION_MODE with real keys

### **Always Verify:**
- ✅ Check .env has `SOLANA_NETWORK=devnet`
- ✅ Confirm different port (3001)
- ✅ Test wallet has < $10 worth
- ✅ SIMULATION_MODE=true

## 🤝 **Contributing Code**

### **1. Create Feature Branch**
```bash
git checkout -b feature/your-improvement
```

### **2. Test Your Changes**
```bash
# Run full test suite
npm test

# Test specific feature
npm run test:feature your-feature

# Manual testing with simulation
SIMULATION_MODE=true npm run dev
```

### **3. Submit Pull Request**
```bash
git add .
git commit -m "feat: add awesome feature"
git push origin feature/your-improvement

# Create PR on GitHub
```

## 📞 **Getting Help**

- **Issues**: Create GitHub issue with `[DEV SETUP]` tag
- **Questions**: Ask in discussion tab
- **Real-time**: Join Discord server (if available)

## 🎯 **What Can Collaborators Test?**

### **Safe to Test:**
- ✅ Signal detection and parsing
- ✅ Position tracking algorithms  
- ✅ P&L calculation logic
- ✅ UI/UX improvements
- ✅ Database operations
- ✅ API endpoints
- ✅ Alert formatting

### **Needs Special Care:**
- ⚠️ Blockchain interactions (use devnet)
- ⚠️ Wallet operations (test wallet only)
- ⚠️ Trading logic (simulation mode)
- ⚠️ Real-time data feeds (may have limits)

---

**Remember: Development should be fun and safe! When in doubt, use simulation mode.** 🛡️