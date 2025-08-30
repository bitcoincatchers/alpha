# 🎯 PRODUCTION RULES - ALEX REQUIREMENTS

## ⚡ REGLA FUNDAMENTAL #1
**DATOS REALES SIEMPRE - NO MÁS DEMOS NI MOCK DATA**

- ✅ Balance: REAL desde blockchain (wallet: 9TkcJVpw9yYkNrTFdhBBq3iYa4r69osa5PfuAwzxS3ht)
- ✅ Posiciones: REAL desde blockchain holdings
- ✅ Transacciones: REAL desde blockchain history
- ✅ Precios: REAL desde DexScreener/APIs
- ✅ Señales: REAL market data

## ❌ PROHIBIDO
- Mock data
- Demo users
- Fake balances
- Test accounts en producción
- Datos simulados

## 💎 NUEVAS REGLAS AGREGADAS
- ✅ **Filtro de Valor Mínimo**: Ocultar posiciones <$1 USD automáticamente
  - Mantiene el portfolio limpio sin "dust"
  - Configurable en PositionManager (default: $1.00 USD)
  - Aplicado server-side para consistencia

## ✅ PERMITIDO PARA DESARROLLO
- Tests internos (pero NUNCA mostrar al usuario)
- Debug tools (ocultos en producción)
- Development endpoints (separados de producción)

## 🎯 OBJETIVO
Producto final SIEMPRE con datos 100% reales para la comunidad de Alex.