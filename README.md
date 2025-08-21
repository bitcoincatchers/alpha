# 🤖 AlphaBot v2.0 - Professional Trading Signals Dashboard

**Built by Alex - Professional Calisthenics Athlete & Crypto Educator**

A professional-grade trading signals detection and ROI tracking system with real-time Telegram bot integration and advanced web dashboard.

## ✨ Features

### 🚀 **Professional Signal Detection**
- Advanced pattern recognition for trading alerts
- Multi-language signal support (English/Spanish)
- Flexible trigger detection (`trading alert`, `$TOKEN`, emojis, etc.)
- Contract address and DexScreener link extraction
- Market cap and entry price parsing

### 💰 **Advanced ROI Tracking**
- Real-time ROI updates from Telegram replies
- Multiple pattern recognition: `x5`, `10x`, `$TOKEN 5x`, `5x $TOKEN`
- Automatic percentage calculation (5x = 400% ROI)
- Context-aware reply detection

### 📱 **Premium Web Dashboard**
- Professional black theme with electric blue accents
- Real-time alert banner for new signals
- Live statistics and monitoring
- Server-Sent Events for instant updates
- Mobile-responsive design

### 🔧 **Configuration Management**
- Visual bot configuration panel
- KOL channel management
- Advanced detection settings
- Connection testing and monitoring

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18.0.0+
- npm or yarn
- PM2 (for process management)

### Quick Start
```bash
# Clone and setup
git clone <repository-url>
cd alphabot
npm install

# Create logs directory
mkdir -p logs

# Start services
npm run setup

# Check status
pm2 list
```

### Manual Setup
```bash
# Install dependencies
npm install

# Clean any existing processes
fuser -k 3000/tcp 2>/dev/null || true

# Start with PM2
pm2 start ecosystem.config.cjs

# Monitor logs
pm2 logs --nostream
```

## 📊 Current Status

### ✅ **Completed Features**
- ✅ Advanced Telegram bot with ROI detection
- ✅ Professional web dashboard with real-time updates
- ✅ SQLite database with enhanced schema
- ✅ Server-Sent Events for live updates
- ✅ Multi-pattern ROI detection system
- ✅ Configuration panel with visual controls
- ✅ Alert banner system for new signals
- ✅ Professional statistics tracking
- ✅ Enhanced error handling and logging

### 🎯 **Main Entry Points**

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /` | Main dashboard interface | - |
| `GET /api/signals/recent` | Get recent signals | `limit`, `offset` |
| `GET /api/signals/stream` | Real-time updates (SSE) | - |
| `POST /api/telegram/connect` | Connect Telegram bot | `token` |
| `POST /api/telegram/add-channel` | Add KOL channel | `channel`, `name` |
| `GET /api/health` | System health check | - |
| `GET /api/stats` | System statistics | - |

### 📈 **Data Architecture**

#### Signal Schema
```sql
CREATE TABLE signals (
    id TEXT PRIMARY KEY,                    -- Unique signal identifier
    token_symbol TEXT NOT NULL,            -- Token symbol ($TOKEN)
    token_contract TEXT,                   -- Contract address
    signal_type TEXT DEFAULT 'BUY',       -- Signal type
    confidence_score REAL DEFAULT 0.8,    -- Detection confidence
    entry_mc INTEGER,                      -- Entry market cap
    raw_message TEXT NOT NULL,            -- Original message
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    kol_name TEXT DEFAULT 'Alex',         -- KOL name
    chart_link TEXT,                      -- Chart URL
    status TEXT DEFAULT 'active',         -- Signal status
    roi_percentage INTEGER DEFAULT NULL,   -- ROI percentage
    roi_updated_at DATETIME DEFAULT NULL, -- ROI update timestamp
    dexscreener_link TEXT DEFAULT NULL,   -- DexScreener link
    telegram_message_id INTEGER,          -- Telegram message ID
    telegram_chat_id INTEGER,            -- Telegram chat ID
    detection_confidence REAL DEFAULT 1.0 -- Detection confidence
);
```

#### Storage Services Used
- **SQLite Database**: Local signal storage with advanced schema
- **In-Memory**: SSE connections, live statistics
- **File System**: Logs, configuration

## 🎮 User Guide

### 1. **Initial Setup**
1. Access the dashboard at `http://localhost:3000`
2. Click "Connect Bot" to open configuration panel
3. Enter your Telegram bot token
4. Click "Connect Telegram Bot"

### 2. **Adding KOL Channels**
1. Click "Connect KOL" 
2. Enter channel ID or username (e.g., `@channel` or `-1001234567890`)
3. Enter KOL display name
4. Click "Add KOL Channel"

### 3. **Signal Detection**
The bot automatically detects signals with patterns like:
```
trading alert: $GROF

CA: AwKDnJpUM2uF9PA9959SLbAmbsJAzwK5HQkVQds8bonk

Link: https://dexscreener.com/solana/example

entry price: 100k mc
```

### 4. **ROI Updates**
Reply to signals with multipliers:
- `x5` → 400% ROI
- `10x` → 900% ROI  
- `$TOKEN 3x` → 200% ROI

## 🚀 Deployment

### Development
```bash
# Start development mode
npm run setup

# Monitor logs
pm2 logs --nostream

# Test health
curl http://localhost:3000/api/health
```

### Production Features
- Automatic restart on crashes
- Memory usage monitoring
- Log file rotation
- Graceful shutdown handling
- Connection pooling for database

## 📊 **Live Statistics**

| Metric | Description |
|--------|-------------|
| **Messages Processed** | Total Telegram messages analyzed |
| **Signals Detected** | Trading signals found |
| **ROI Updates** | ROI multipliers processed |
| **System Uptime** | Service running time |
| **Live Connections** | Active SSE connections |

## 🛡️ **Professional Features**

### Error Handling
- Comprehensive try-catch blocks
- Graceful degradation
- Connection retry logic
- Memory leak prevention

### Security
- Input validation and sanitization
- SQL injection prevention
- Rate limiting ready
- CORS configuration

### Performance
- Connection pooling
- Efficient database queries
- Memory usage optimization
- Process restart management

## 🎯 **Recommended Next Steps**

1. **GitHub Integration** - Configure GitHub for permanent code backup
2. **Production Deployment** - Set up on VPS/cloud provider
3. **Enhanced Analytics** - Add trading performance metrics
4. **Alert Integrations** - Discord, email, push notifications
5. **Mobile App** - React Native companion app
6. **API Expansion** - Public API for third-party integrations

## 📋 **Development Commands**

```bash
# Service Management
npm run setup      # Initial setup and start
npm run restart    # Restart all services
npm run stop       # Stop all services  
npm run status     # Check service status
npm run logs       # View logs

# Testing
npm test          # Health check test
curl http://localhost:3000/api/health

# Monitoring
pm2 list          # List processes
pm2 logs --nostream  # View logs
pm2 monit         # Process monitor
```

## 🎨 **Design Philosophy**

- **Professional First**: Enterprise-grade reliability and performance
- **User Experience**: Intuitive interface with premium aesthetics
- **Real-Time**: Instant updates and notifications
- **Scalable**: Built to handle high message volumes
- **Maintainable**: Clean code with comprehensive documentation

## 🤝 **Support**

For issues, feature requests, or questions:
- Check the logs: `pm2 logs --nostream`
- Health check: `curl http://localhost:3000/api/health`
- System stats: `curl http://localhost:3000/api/stats`

---

**Built with ❤️ by Alex - Professional Calisthenics Athlete & Crypto Educator**

*Combining athletic discipline with crypto expertise to create professional-grade trading tools.*