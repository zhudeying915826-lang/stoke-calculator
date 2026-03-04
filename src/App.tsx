import { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  BarChart3,
  ShieldAlert,
  Settings,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  Percent,
  DollarSign,
  Wallet,
  ArrowRightLeft
} from 'lucide-react';

// ==================== 类型定义 ====================

type TradeMode = 'stock' | 'futures';
type FuturesDirection = 'long' | 'short';
type FuturesAction = 'open' | 'close';

// 股票做T记录
interface TTrade {
  id: string;
  date: string;
  direction: 'buy_first' | 'sell_first';
  price: number;
  quantity: number;
  closePrice?: number;
  profit: number;
  status: 'open' | 'closed';
}

// 股票持仓
interface StockPosition {
  id: string;
  code: string;
  name: string;
  buyPrice: number;
  quantity: number;
  currentPrice: number;
  commissionRate: number;
  minCommission: number;
  stampDutyRate: number;
  transferFeeRate: number;
  tTrades: TTrade[];
  stopLossConfig: {
    enabled: boolean;
    pauseThreshold: number;
    pauseDays: number;
    halfPositionThreshold: number;
    clearThreshold: number;
  };
  takeProfitConfig: {
    enabled: boolean;
    steps: { profitPercent: number; reducePercent: number }[];
  };
  isPaused: boolean;
  pauseEndDate?: string;
  createdAt: string;
}

// 期货合约配置
interface FuturesContract {
  code: string;
  name: string;
  multiplier: number;
  marginRate: number;
  maintenanceRate: number;
  minPriceUnit: number;
  exchange: string;
  feePerHand: number;
}

// 期货持仓（分次开仓，加权平均）
interface FuturesPosition {
  id: string;
  contract: FuturesContract;
  direction: FuturesDirection;
  totalHands: number;
  avgPrice: number;
  occupiedMargin: number;
  openDate: string;
  trades: FuturesTradeRecord[];
}

// 期货交易记录
interface FuturesTradeRecord {
  id: string;
  date: string;
  action: FuturesAction;
  direction: FuturesDirection;
  price: number;
  hands: number;
  fee: number;
  profit?: number;
}

// 期货资金账户
interface FuturesAccount {
  initialBalance: number;
  available: number;
  occupiedMargin: number;
  floatingProfit: number;
  closeProfit: number;
  totalEquity: number;
  riskRatio: number;
}

// ==================== 合约库 ====================

const FUTURES_CONTRACTS: FuturesContract[] = [
  { code: 'IF', name: '沪深300股指', multiplier: 300, marginRate: 0.12, maintenanceRate: 0.10, minPriceUnit: 0.2, exchange: 'CFFEX', feePerHand: 30 },
  { code: 'IC', name: '中证500股指', multiplier: 200, marginRate: 0.12, maintenanceRate: 0.10, minPriceUnit: 0.2, exchange: 'CFFEX', feePerHand: 30 },
  { code: 'IH', name: '上证50股指', multiplier: 300, marginRate: 0.12, maintenanceRate: 0.10, minPriceUnit: 0.2, exchange: 'CFFEX', feePerHand: 30 },
  { code: 'RB', name: '螺纹钢', multiplier: 10, marginRate: 0.09, maintenanceRate: 0.07, minPriceUnit: 1, exchange: 'SHFE', feePerHand: 4 },
  { code: 'CU', name: '铜', multiplier: 5, marginRate: 0.10, maintenanceRate: 0.08, minPriceUnit: 10, exchange: 'SHFE', feePerHand: 15 },
  { code: 'AU', name: '黄金', multiplier: 1000, marginRate: 0.08, maintenanceRate: 0.06, minPriceUnit: 0.02, exchange: 'SHFE', feePerHand: 10 },
  { code: 'AG', name: '白银', multiplier: 15, marginRate: 0.12, maintenanceRate: 0.10, minPriceUnit: 1, exchange: 'SHFE', feePerHand: 5 },
  { code: 'C', name: '玉米', multiplier: 10, marginRate: 0.08, maintenanceRate: 0.06, minPriceUnit: 1, exchange: 'DCE', feePerHand: 1.2 },
  { code: 'M', name: '豆粕', multiplier: 10, marginRate: 0.08, maintenanceRate: 0.06, minPriceUnit: 1, exchange: 'DCE', feePerHand: 1.5 },
  { code: 'SC', name: '原油', multiplier: 1000, marginRate: 0.10, maintenanceRate: 0.08, minPriceUnit: 0.1, exchange: 'INE', feePerHand: 20 },
];

// ==================== 辅助函数 ====================

const generateId = () => Math.random().toString(36).substr(2, 9);
const formatDate = (date: Date) => date.toISOString().split('T')[0];

const calculateStockHoldingCost = (position: StockPosition): number => {
  let totalCost = position.buyPrice * position.quantity;
  
  position.tTrades.forEach(t => {
    if (t.direction === 'buy_first' && t.status === 'closed') {
      totalCost += t.price * t.quantity - t.closePrice! * t.quantity;
    } else if (t.direction === 'sell_first' && t.status === 'closed') {
      totalCost -= t.price * t.quantity - t.closePrice! * t.quantity;
    }
  });
  
  return position.quantity > 0 ? totalCost / position.quantity : 0;
};

// ==================== 主组件 ====================

export default function TradingSystem() {
  // 全局模式
  const [mode, setMode] = useState<TradeMode>('stock');

  // ===== 股票状态 =====
  const [stockActiveTab, setStockActiveTab] = useState<'positions' | 'ttrade' | 'strategy'>('positions');
  const [stockPositions, setStockPositions] = useState<StockPosition[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('stock-positions');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse saved positions:', e);
        }
      }
    }
    return [];
  });
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [showNewStockForm, setShowNewStockForm] = useState(false);
  const [newStock, setNewStock] = useState<Partial<StockPosition>>({
    commissionRate: 3,
    minCommission: 5,
    stampDutyRate: 10,
    transferFeeRate: 0.1,
    stopLossConfig: {
      enabled: true,
      pauseThreshold: -8,
      pauseDays: 3,
      halfPositionThreshold: -15,
      clearThreshold: -20
    },
    takeProfitConfig: {
      enabled: true,
      steps: [
        { profitPercent: 30, reducePercent: 30 },
        { profitPercent: 60, reducePercent: 30 },
        { profitPercent: 100, reducePercent: 60 }
      ]
    }
  });
  const [tForm, setTForm] = useState({
    direction: 'buy_first' as 'buy_first' | 'sell_first',
    price: '',
    quantity: '',
    closePrice: ''
  });

  // ===== 期货状态 =====
  const [futuresPositions, setFuturesPositions] = useState<FuturesPosition[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('futures-positions');
      if (saved) return JSON.parse(saved);
    }
    return [];
  });
  const [futuresAccount, setFuturesAccount] = useState<FuturesAccount>({
    initialBalance: 1000000,
    available: 1000000,
    occupiedMargin: 0,
    floatingProfit: 0,
    closeProfit: 0,
    totalEquity: 1000000,
    riskRatio: 0
  });
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [selectedFuturesId, setSelectedFuturesId] = useState<string | null>(null);
  const [futuresTradeForm, setFuturesTradeForm] = useState({
    contractCode: 'IF',
    direction: 'long' as FuturesDirection,
    action: 'open' as FuturesAction,
    price: '',
    hands: '1'
  });

  // 初始化期货行情
  useEffect(() => {
    const initialPrices: Record<string, number> = {};
    FUTURES_CONTRACTS.forEach(c => {
      initialPrices[c.code] = c.code.startsWith('I') ? 3500 : (c.code === 'AU' ? 450 : (c.code === 'SC' ? 550 : 3000));
    });
    setMarketPrices(initialPrices);
  }, []);

  // 保存股票数据
  useEffect(() => {
    localStorage.setItem('stock-positions', JSON.stringify(stockPositions));
  }, [stockPositions]);

  // 保存期货数据
  useEffect(() => {
    localStorage.setItem('futures-positions', JSON.stringify(futuresPositions));
    updateFuturesAccount();
  }, [futuresPositions, marketPrices]);

  // 更新期货账户计算
  const updateFuturesAccount = () => {
    let totalOccupied = 0;
    let totalFloating = 0;
    let totalClose = 0;

    futuresPositions.forEach(pos => {
      const currentPrice = marketPrices[pos.contract.code] || pos.avgPrice;
      totalOccupied += pos.occupiedMargin;
      
      const direction = pos.direction === 'long' ? 1 : -1;
      const floating = (currentPrice - pos.avgPrice) * pos.contract.multiplier * pos.totalHands * direction;
      totalFloating += floating;

      totalClose += pos.trades
        .filter(t => t.action === 'close')
        .reduce((sum, t) => sum + (t.profit || 0), 0);
    });

    const totalEquity = futuresAccount.initialBalance + totalClose + totalFloating;
    const available = totalEquity - totalOccupied;
    const riskRatio = totalEquity > 0 ? (totalOccupied / totalEquity) * 100 : 0;

    setFuturesAccount(prev => ({
      ...prev,
      available,
      occupiedMargin: totalOccupied,
      floatingProfit: totalFloating,
      closeProfit: totalClose,
      totalEquity,
      riskRatio
    }));
  };

  // ==================== 股票函数 ====================
  
  const addStockPosition = () => {
    if (!newStock.code || !newStock.buyPrice || !newStock.quantity) return;
    
    const position: StockPosition = {
      id: generateId(),
      code: newStock.code.toUpperCase(),
      name: newStock.name || newStock.code!.toUpperCase(),
      buyPrice: Number(newStock.buyPrice),
      quantity: Number(newStock.quantity),
      currentPrice: Number(newStock.buyPrice),
      commissionRate: Number(newStock.commissionRate) || 3,
      minCommission: Number(newStock.minCommission) || 5,
      stampDutyRate: Number(newStock.stampDutyRate) || 10,
      transferFeeRate: Number(newStock.transferFeeRate) || 0.1,
      tTrades: [],
      stopLossConfig: newStock.stopLossConfig!,
      takeProfitConfig: newStock.takeProfitConfig!,
      isPaused: false,
      createdAt: formatDate(new Date())
    };
    
    setStockPositions([...stockPositions, position]);
    setSelectedStockId(position.id);
    setShowNewStockForm(false);
    setNewStock({
      commissionRate: 3,
      minCommission: 5,
      stampDutyRate: 10,
      transferFeeRate: 0.1,
      stopLossConfig: {
        enabled: true,
        pauseThreshold: -8,
        pauseDays: 3,
        halfPositionThreshold: -15,
        clearThreshold: -20
      },
      takeProfitConfig: {
        enabled: true,
        steps: [
          { profitPercent: 30, reducePercent: 30 },
          { profitPercent: 60, reducePercent: 30 },
          { profitPercent: 100, reducePercent: 60 }
        ]
      }
    });
  };

  const deleteStockPosition = (id: string) => {
    setStockPositions(stockPositions.filter(p => p.id !== id));
    if (selectedStockId === id) setSelectedStockId(null);
  };

  const updateStockPrice = (id: string, price: number) => {
    setStockPositions(stockPositions.map(p => 
      p.id === id ? { ...p, currentPrice: price } : p
    ));
  };

  const addTTrade = () => {
    const currentPosition = stockPositions.find(p => p.id === selectedStockId);
    if (!currentPosition || !tForm.price || !tForm.quantity) return;
    
    const tTrade: TTrade = {
      id: generateId(),
      date: formatDate(new Date()),
      direction: tForm.direction,
      price: Number(tForm.price),
      quantity: Number(tForm.quantity),
      closePrice: tForm.closePrice ? Number(tForm.closePrice) : undefined,
      profit: 0,
      status: tForm.closePrice ? 'closed' : 'open'
    };
    
    if (tTrade.status === 'closed' && tTrade.closePrice) {
      if (tTrade.direction === 'buy_first') {
        tTrade.profit = (tTrade.closePrice - tTrade.price) * tTrade.quantity;
      } else {
        tTrade.profit = (tTrade.price - tTrade.closePrice) * tTrade.quantity;
      }
    }
    
    setStockPositions(stockPositions.map(p => 
      p.id === currentPosition.id 
        ? { ...p, tTrades: [...p.tTrades, tTrade] }
        : p
    ));
    
    setTForm({ direction: 'buy_first', price: '', quantity: '', closePrice: '' });
  };

  const closeTTrade = (tradeId: string, closePrice: number) => {
    const currentPosition = stockPositions.find(p => p.id === selectedStockId);
    if (!currentPosition) return;
    
    setStockPositions(stockPositions.map(p => {
      if (p.id !== currentPosition.id) return p;
      return {
        ...p,
        tTrades: p.tTrades.map(t => {
          if (t.id !== tradeId) return t;
          let profit = 0;
          if (t.direction === 'buy_first') {
            profit = (closePrice - t.price) * t.quantity;
          } else {
            profit = (t.price - closePrice) * t.quantity;
          }
          return { ...t, closePrice, profit, status: 'closed' as const };
        })
      };
    }));
  };

  const executeStockStrategy = (action: 'pause' | 'half' | 'clear') => {
    const currentPosition = stockPositions.find(p => p.id === selectedStockId);
    if (!currentPosition) return;
    
    switch (action) {
      case 'pause': {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + currentPosition.stopLossConfig.pauseDays);
        setStockPositions(stockPositions.map(p => 
          p.id === currentPosition.id 
            ? { ...p, isPaused: true, pauseEndDate: formatDate(endDate) }
            : p
        ));
        break;
      }
      case 'half': {
        setStockPositions(stockPositions.map(p => 
          p.id === currentPosition.id ? { ...p, quantity: Math.floor(p.quantity / 2) } : p
        ));
        break;
      }
      case 'clear': {
        setStockPositions(stockPositions.map(p => 
          p.id === currentPosition.id ? { ...p, quantity: 0 } : p
        ));
        break;
      }
    }
  };

  // ==================== 期货函数 ====================

  const executeFuturesTrade = () => {
    const contract = FUTURES_CONTRACTS.find(c => c.code === futuresTradeForm.contractCode);
    if (!contract || !futuresTradeForm.price || !futuresTradeForm.hands) return;

    const price = Number(futuresTradeForm.price);
    const hands = Number(futuresTradeForm.hands);
    const fee = contract.feePerHand * hands;

    if (futuresTradeForm.action === 'open') {
      const margin = price * contract.multiplier * hands * contract.marginRate;
      
      if (margin + fee > futuresAccount.available) {
        alert('可用资金不足！');
        return;
      }

      const existingPos = futuresPositions.find(p => 
        p.contract.code === contract.code && p.direction === futuresTradeForm.direction
      );

      if (existingPos) {
        const newTotalHands = existingPos.totalHands + hands;
        const newAvgPrice = (existingPos.avgPrice * existingPos.totalHands + price * hands) / newTotalHands;
        const newMargin = newAvgPrice * contract.multiplier * newTotalHands * contract.marginRate;
        
        setFuturesPositions(futuresPositions.map(p => {
          if (p.id !== existingPos.id) return p;
          return {
            ...p,
            totalHands: newTotalHands,
            avgPrice: newAvgPrice,
            occupiedMargin: newMargin,
            trades: [...p.trades, {
              id: generateId(),
              date: new Date().toISOString().slice(0, 16),
              action: 'open',
              direction: futuresTradeForm.direction,
              price,
              hands,
              fee
            }]
          };
        }));
      } else {
        const newPosition: FuturesPosition = {
          id: generateId(),
          contract,
          direction: futuresTradeForm.direction,
          totalHands: hands,
          avgPrice: price,
          occupiedMargin: margin,
          openDate: new Date().toISOString().slice(0, 10),
          trades: [{
            id: generateId(),
            date: new Date().toISOString().slice(0, 16),
            action: 'open',
            direction: futuresTradeForm.direction,
            price,
            hands,
            fee
          }]
        };
        setFuturesPositions([...futuresPositions, newPosition]);
      }
    } else {
      const posToClose = futuresPositions.find(p => 
        p.contract.code === contract.code && p.direction === futuresTradeForm.direction
      );

      if (!posToClose) {
        alert('没有对应的持仓可平！');
        return;
      }

      if (hands > posToClose.totalHands) {
        alert('平仓手数超过持仓！');
        return;
      }

      const direction = posToClose.direction === 'long' ? 1 : -1;
      const profit = (price - posToClose.avgPrice) * contract.multiplier * hands * direction - fee;

      const newHands = posToClose.totalHands - hands;
      const newMargin = newHands > 0 
        ? posToClose.avgPrice * contract.multiplier * newHands * contract.marginRate 
        : 0;

      if (newHands === 0) {
        setFuturesPositions(futuresPositions.filter(p => p.id !== posToClose.id));
        if (selectedFuturesId === posToClose.id) setSelectedFuturesId(null);
      } else {
        setFuturesPositions(futuresPositions.map(p => {
          if (p.id !== posToClose.id) return p;
          return {
            ...p,
            totalHands: newHands,
            occupiedMargin: newMargin,
            trades: [...p.trades, {
              id: generateId(),
              date: new Date().toISOString().slice(0, 16),
              action: 'close',
              direction: futuresTradeForm.direction,
              price,
              hands,
              fee,
              profit
            }]
          };
        }));
      }
    }

    setFuturesTradeForm(prev => ({ ...prev, price: '', hands: '1' }));
  };

  const calculateLiquidationPrice = (position: FuturesPosition): number => {
    const maintenanceMargin = position.avgPrice * position.contract.multiplier * position.totalHands * position.contract.maintenanceRate;
    const availableEquity = futuresAccount.initialBalance + futuresAccount.closeProfit;
    const direction = position.direction === 'long' ? 1 : -1;
    const liquidChange = (maintenanceMargin - availableEquity) / (position.contract.multiplier * position.totalHands * direction);
    return position.avgPrice + liquidChange;
  };

  const updateMarketPrice = (code: string, price: number) => {
    setMarketPrices(prev => ({ ...prev, [code]: price }));
  };

  // ==================== 计算属性 ====================

  const currentStock = stockPositions.find(p => p.id === selectedStockId);
  
  const stockCalculation = useMemo(() => {
    if (!currentStock) return null;
    const buyPrice = currentStock.buyPrice;
    const buyQty = currentStock.quantity;
    const sellPrice = currentStock.currentPrice;
    const sellQty = currentStock.quantity;

    const buyAmount = buyPrice * buyQty;
    const buyCommission = Math.max(buyAmount * (currentStock.commissionRate / 10000), currentStock.minCommission);
    const buyTransferFee = buyAmount * (currentStock.transferFeeRate / 10000);
    const buyTotalCost = buyCommission + buyTransferFee;
    const buyNetCost = buyAmount + buyTotalCost;

    const sellCommissionRate = currentStock.commissionRate / 10000;
    const stampDutyRate = currentStock.stampDutyRate / 10000;
    const transferRate = currentStock.transferFeeRate / 10000;
    
    const denominator = 1 - sellCommissionRate - stampDutyRate - transferRate;
    const breakEvenPrice = denominator > 0 ? (buyNetCost + currentStock.minCommission) / (buyQty * denominator) : 0;

    const sellAmount = sellPrice * sellQty;
    const sellCommission = Math.max(sellAmount * sellCommissionRate, currentStock.minCommission);
    const sellStampDuty = sellAmount * stampDutyRate;
    const sellTransferFee = sellAmount * transferRate;
    const sellTotalCost = sellCommission + sellStampDuty + sellTransferFee;
    const sellNetIncome = sellAmount - sellTotalCost;

    const grossProfit = sellAmount - buyAmount;
    const totalFee = buyTotalCost + sellTotalCost;
    const netProfit = sellNetIncome - buyNetCost;
    const profitRate = buyNetCost > 0 ? (netProfit / buyNetCost) * 100 : 0;

    return {
      buyAmount, buyCommission, buyTransferFee, buyTotalCost, buyNetCost, breakEvenPrice,
      sellAmount, sellCommission, sellStampDuty, sellTransferFee, sellTotalCost, sellNetIncome,
      grossProfit, totalFee, netProfit, profitRate
    };
  }, [currentStock]);

  const getStockStrategyAlerts = (position: StockPosition) => {
    if (!stockCalculation) return [];
    const alerts: { type: 'warning' | 'success' | 'danger'; message: string }[] = [];
    const profitRate = stockCalculation.profitRate;
    
    if (position.takeProfitConfig.enabled) {
      position.takeProfitConfig.steps.forEach(step => {
        if (profitRate >= step.profitPercent) {
          alerts.push({ type: 'success', message: `已达到止盈点 ${step.profitPercent}%，建议减仓 ${step.reducePercent}%` });
        }
      });
    }
    
    if (position.stopLossConfig.enabled && !position.isPaused) {
      const { pauseThreshold, halfPositionThreshold, clearThreshold } = position.stopLossConfig;
      if (profitRate <= clearThreshold) {
        alerts.push({ type: 'danger', message: `已达到清仓线 ${clearThreshold}%，建议立即清仓！` });
      } else if (profitRate <= halfPositionThreshold) {
        alerts.push({ type: 'warning', message: `已达到半仓线 ${halfPositionThreshold}%，建议减持一半仓位` });
      } else if (profitRate <= pauseThreshold) {
        alerts.push({ type: 'warning', message: `已达到暂停线 ${pauseThreshold}%，建议暂停交易 ${position.stopLossConfig.pauseDays} 天` });
      }
    }
    
    if (position.isPaused && position.pauseEndDate) {
      const today = new Date();
      const endDate = new Date(position.pauseEndDate);
      if (today < endDate) {
        alerts.push({ type: 'warning', message: `交易暂停中，恢复日期：${position.pauseEndDate}` });
      }
    }
    return alerts;
  };

  const selectedFutures = futuresPositions.find(p => p.id === selectedFuturesId);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部切换 */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Calculator className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">智能交易管理系统</h1>
              <p className="text-slate-500 text-sm">
                {mode === 'stock' ? '股票·多标的·做T·止盈止损' : '期货·保证金交易·双向开仓·强平预警'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setMode('stock')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                mode === 'stock' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              <TrendingUp className="w-5 h-5" />
              股票
            </button>
            <button
              onClick={() => setMode('futures')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                mode === 'futures' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              期货
            </button>
          </div>
        </div>

        {/* ===== 股票模式 ===== */}
        {mode === 'stock' ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* 左侧持仓列表 */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-800">持仓列表</h3>
                    <p className="text-xs text-slate-500 mt-1">共 {stockPositions.length} 个标的</p>
                  </div>
                  <button
                    onClick={() => setShowNewStockForm(true)}
                    className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                  {stockPositions.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">
                      暂无持仓，点击右上角添加
                    </div>
                  ) : (
                    stockPositions.map(position => {
                      const data = stockCalculation && currentStock?.id === position.id ? stockCalculation : null;
                      const alerts = getStockStrategyAlerts(position);
                      return (
                        <button
                          key={position.id}
                          onClick={() => setSelectedStockId(position.id)}
                          className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${
                            selectedStockId === position.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'
                          } ${position.quantity === 0 ? 'opacity-50' : ''}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="font-bold text-slate-800">{position.code}</span>
                              <span className="text-xs text-slate-500 ml-2">{position.name}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteStockPosition(position.id); }}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600">持仓 {position.quantity} 股</span>
                            {data && (
                              <span className={`font-bold ${data.netProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {data.profitRate.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          {alerts.length > 0 && position.quantity > 0 && (
                            <div className="mt-2 flex items-center gap-1 text-xs">
                              <AlertTriangle className={`w-3 h-3 ${alerts[0].type === 'danger' ? 'text-red-600' : alerts[0].type === 'success' ? 'text-green-600' : 'text-yellow-600'}`} />
                              <span className={alerts[0].type === 'danger' ? 'text-red-600' : alerts[0].type === 'success' ? 'text-green-600' : 'text-yellow-600'}>
                                {alerts[0].message.substring(0, 15)}...
                              </span>
                            </div>
                          )}
                          {position.isPaused && (
                            <div className="mt-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded inline-block">
                              暂停中
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* 右侧详情区 */}
            <div className="lg:col-span-3">
              {!currentStock ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-400">
                  <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p>选择左侧持仓查看详情，或添加新持仓</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 标的头部 */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">{currentStock.code}</h2>
                        <p className="text-slate-500">{currentStock.name}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm text-slate-500">当前价格</div>
                          <input
                            type="number"
                            value={currentStock.currentPrice}
                            onChange={(e) => updateStockPrice(currentStock.id, Number(e.target.value))}
                            className="w-32 px-3 py-2 text-right font-bold text-lg border border-slate-300 rounded-lg focus:border-blue-500 outline-none"
                            step="0.01"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => setStockActiveTab('positions')} className={`px-4 py-2 rounded-lg font-medium ${stockActiveTab === 'positions' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>持仓概览</button>
                      <button onClick={() => setStockActiveTab('ttrade')} className={`px-4 py-2 rounded-lg font-medium ${stockActiveTab === 'ttrade' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>做T记录 ({currentStock.tTrades.length})</button>
                      <button onClick={() => setStockActiveTab('strategy')} className={`px-4 py-2 rounded-lg font-medium ${stockActiveTab === 'strategy' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>策略设置</button>
                    </div>
                  </div>

                  {/* 策略提醒 */}
                  {(() => {
                    const alerts = getStockStrategyAlerts(currentStock);
                    if (alerts.length === 0 || currentStock.quantity === 0) return null;
                    return (
                      <div className="space-y-2">
                        {alerts.map((alert, idx) => (
                          <div key={idx} className={`p-4 rounded-xl flex items-center justify-between ${alert.type === 'danger' ? 'bg-red-50 border border-red-200 text-red-800' : alert.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}`}>
                            <div className="flex items-center gap-3">
                              {alert.type === 'danger' ? <ShieldAlert className="w-5 h-5" /> : alert.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                              <span className="font-medium">{alert.message}</span>
                            </div>
                            {alert.message.includes('暂停') && !currentStock.isPaused && (
                              <button onClick={() => executeStockStrategy('pause')} className="px-3 py-1 bg-white rounded-lg text-sm font-medium">执行暂停</button>
                            )}
                            {alert.message.includes('半仓') && (
                              <button onClick={() => executeStockStrategy('half')} className="px-3 py-1 bg-white rounded-lg text-sm font-medium">执行减仓</button>
                            )}
                            {alert.message.includes('清仓') && (
                              <button onClick={() => executeStockStrategy('clear')} className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm font-medium">执行清仓</button>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* 持仓概览 */}
                  {stockActiveTab === 'positions' && stockCalculation && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-blue-600" />成本与盈亏</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between"><span className="text-slate-600">持仓成本</span><span className="font-bold">¥{calculateStockHoldingCost(currentStock).toFixed(3)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">当前市值</span><span className="font-bold">¥{stockCalculation.sellAmount.toFixed(2)}</span></div>
                          <div className="h-px bg-slate-200 my-2" />
                          <div className="flex justify-between"><span className="text-slate-600">净利润</span><span className={`text-xl font-bold ${stockCalculation.netProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>{stockCalculation.netProfit >= 0 ? '+' : ''}¥{stockCalculation.netProfit.toFixed(2)}</span></div>
                          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <div className="text-sm text-blue-800 mb-1">保本价</div>
                            <div className="text-xl font-bold text-blue-700">¥{stockCalculation.breakEvenPrice.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Percent className="w-5 h-5 text-green-600" />费用明细</h3>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between"><span className="text-slate-600">买入佣金</span><span className="text-red-600">-¥{stockCalculation.buyCommission.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">卖出印花税</span><span className="text-red-600">-¥{stockCalculation.sellStampDuty.toFixed(2)}</span></div>
                          <div className="h-px bg-slate-200 my-2" />
                          <div className="flex justify-between font-bold"><span>总费用</span><span className="text-red-600">¥{stockCalculation.totalFee.toFixed(2)}</span></div>
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Settings className="w-5 h-5 text-purple-600" />费率设置</h3>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-slate-500">佣金费率 (‱)</label>
                            <input type="number" step="0.1" value={currentStock.commissionRate} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, commissionRate: Number(e.target.value) } : p))} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">最低佣金 (元)</label>
                            <input type="number" value={currentStock.minCommission} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, minCommission: Number(e.target.value) } : p))} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">印花税率 (‱)</label>
                            <input type="number" step="0.1" value={currentStock.stampDutyRate} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, stampDutyRate: Number(e.target.value) } : p))} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 做T记录 */}
                  {stockActiveTab === 'ttrade' && (
                    <div className="space-y-6">
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600" />新增做T记录</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">操作方向</label>
                            <select value={tForm.direction} onChange={(e) => setTForm({...tForm, direction: e.target.value as any})} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
                              <option value="buy_first">先买后卖（正向T）</option>
                              <option value="sell_first">先卖后买（反向T）</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">{tForm.direction === 'buy_first' ? '买入价格' : '卖出价格'} (元)</label>
                            <input type="number" step="0.01" value={tForm.price} onChange={(e) => setTForm({...tForm, price: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg" placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">数量 (股)</label>
                            <input type="number" value={tForm.quantity} onChange={(e) => setTForm({...tForm, quantity: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg" placeholder="100" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">平仓价格 (元)</label>
                            <div className="flex gap-2">
                              <input type="number" step="0.01" value={tForm.closePrice} onChange={(e) => setTForm({...tForm, closePrice: e.target.value})} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg" placeholder="可选" />
                              <button onClick={addTTrade} disabled={!tForm.price || !tForm.quantity} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">添加</button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b border-slate-200"><h3 className="font-bold text-slate-800">做T历史记录</h3></div>
                        {currentStock.tTrades.length === 0 ? (
                          <div className="p-8 text-center text-slate-400">暂无做T记录</div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {currentStock.tTrades.map((trade) => (
                              <div key={trade.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${trade.direction === 'buy_first' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {trade.direction === 'buy_first' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-800">{trade.direction === 'buy_first' ? '先买后卖' : '先卖后买'} <span className="text-sm text-slate-500 ml-2">{trade.date}</span></div>
                                    <div className="text-sm text-slate-600">{trade.price}元 × {trade.quantity}股 {trade.closePrice && `→ ${trade.closePrice}元`}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  {trade.status === 'closed' ? (
                                    <div className={`text-right ${trade.profit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                      <div className="font-bold">{trade.profit >= 0 ? '+' : ''}¥{trade.profit.toFixed(2)}</div>
                                      <div className="text-xs">已平仓</div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">未平仓</span>
                                      <input type="number" step="0.01" placeholder="平仓价" className="w-24 px-2 py-1 text-sm border border-slate-300 rounded" onKeyDown={(e) => { if (e.key === 'Enter') closeTTrade(trade.id, Number((e.target as HTMLInputElement).value)); }} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 策略设置 */}
                  {stockActiveTab === 'strategy' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-red-600" />阶梯止盈策略</h3>
                          <input type="checkbox" checked={currentStock.takeProfitConfig.enabled} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, enabled: e.target.checked } } : p))} className="w-4 h-4" />
                        </div>
                        {currentStock.takeProfitConfig.steps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-4 mb-3 p-3 bg-slate-50 rounded-lg">
                            <div className="flex-1">
                              <label className="text-xs text-slate-500 block">盈利达到</label>
                              <div className="flex items-center gap-2">
                                <input type="number" value={step.profitPercent} onChange={(e) => { const newSteps = [...currentStock.takeProfitConfig.steps]; newSteps[idx].profitPercent = Number(e.target.value); setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, steps: newSteps } } : p)); }} className="w-20 px-2 py-1 border rounded" />
                                <span>%</span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <label className="text-xs text-slate-500 block">减仓</label>
                              <div className="flex items-center gap-2">
                                <input type="number" value={step.reducePercent} onChange={(e) => { const newSteps = [...currentStock.takeProfitConfig.steps]; newSteps[idx].reducePercent = Number(e.target.value); setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, steps: newSteps } } : p)); }} className="w-20 px-2 py-1 border rounded" />
                                <span>%</span>
                              </div>
                            </div>
                            <button onClick={() => { const newSteps = currentStock.takeProfitConfig.steps.filter((_, i) => i !== idx); setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, steps: newSteps } } : p)); }} className="text-red-600"><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                        <button onClick={() => { const newSteps = [...currentStock.takeProfitConfig.steps, { profitPercent: 50, reducePercent: 20 }]; setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, steps: newSteps } } : p)); }} className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-500 hover:text-blue-600">+ 添加止盈阶梯</button>
                      </div>

                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-green-600" />阶梯止损策略</h3>
                          <input type="checkbox" checked={currentStock.stopLossConfig.enabled} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, stopLossConfig: { ...p.stopLossConfig, enabled: e.target.checked } } : p))} className="w-4 h-4" />
                        </div>
                        <div className="space-y-4">
                          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                            <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium text-yellow-800">暂停交易线</span><span className="text-xs text-yellow-600">短期调整</span></div>
                            <div className="flex items-center gap-2">
                              <span>跌幅达</span>
                              <input type="number" value={currentStock.stopLossConfig.pauseThreshold} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, stopLossConfig: { ...p.stopLossConfig, pauseThreshold: Number(e.target.value) } } : p))} className="w-20 px-2 py-1 border border-yellow-300 rounded text-center" />
                              <span>%，暂停</span>
                              <input type="number" value={currentStock.stopLossConfig.pauseDays} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, stopLossConfig: { ...p.stopLossConfig, pauseDays: Number(e.target.value) } } : p))} className="w-16 px-2 py-1 border border-yellow-300 rounded text-center" />
                              <span>天</span>
                            </div>
                          </div>
                          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                            <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium text-orange-800">半仓减持线</span><span className="text-xs text-orange-600">中期调整</span></div>
                            <div className="flex items-center gap-2">
                              <span>跌幅达</span>
                              <input type="number" value={currentStock.stopLossConfig.halfPositionThreshold} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, stopLossConfig: { ...p.stopLossConfig, halfPositionThreshold: Number(e.target.value) } } : p))} className="w-20 px-2 py-1 border border-orange-300 rounded text-center" />
                              <span>%，减半仓位</span>
                            </div>
                          </div>
                          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium text-red-800">清仓退场线</span><span className="text-xs text-red-600">风险失控</span></div>
                            <div className="flex items-center gap-2">
                              <span>跌幅达</span>
                              <input type="number" value={currentStock.stopLossConfig.clearThreshold} onChange={(e) => setStockPositions(stockPositions.map(p => p.id === currentStock.id ? { ...p, stopLossConfig: { ...p.stopLossConfig, clearThreshold: Number(e.target.value) } } : p))} className="w-20 px-2 py-1 border border-red-300 rounded text-center" />
                              <span>%，全部清仓</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 新建股票弹窗 */}
            {showNewStockForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-900">新建股票持仓</h3>
                    <button onClick={() => setShowNewStockForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">股票代码</label>
                        <input type="text" value={newStock.code || ''} onChange={(e) => setNewStock({...newStock, code: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg" placeholder="如：000001" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">股票名称</label>
                        <input type="text" value={newStock.name || ''} onChange={(e) => setNewStock({...newStock, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg" placeholder="如：平安银行" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">买入价格 (元)</label>
                        <input type="number" step="0.01" value={newStock.buyPrice || ''} onChange={(e) => setNewStock({...newStock, buyPrice: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg" placeholder="0.00" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">买入数量 (股)</label>
                        <input type="number" value={newStock.quantity || ''} onChange={(e) => setNewStock({...newStock, quantity: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg" placeholder="100" />
                      </div>
                    </div>
                  </div>
                  <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                    <button onClick={() => setShowNewStockForm(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">取消</button>
                    <button onClick={addStockPosition} disabled={!newStock.code || !newStock.buyPrice || !newStock.quantity} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">添加持仓</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ===== 期货模式（全新重构） ===== */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧交易面板 */}
            <div className="lg:col-span-1 space-y-6">
              {/* 资金账户 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-purple-600" />
                  资金账户
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-600">期初权益</span>
                    <span className="font-bold">¥{futuresAccount.initialBalance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-sm text-blue-800">动态权益</span>
                    <span className="font-bold text-blue-700">¥{futuresAccount.totalEquity.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm text-green-800">可用资金</span>
                    <span className="font-bold text-green-700">¥{futuresAccount.available.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <span className="text-sm text-purple-800">占用保证金</span>
                    <span className="font-bold text-purple-700">¥{futuresAccount.occupiedMargin.toLocaleString()}</span>
                  </div>
                  <div className={`flex justify-between items-center p-3 rounded-lg border ${futuresAccount.riskRatio > 80 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`text-sm ${futuresAccount.riskRatio > 80 ? 'text-red-800' : 'text-slate-600'}`}>风险度</span>
                    <span className={`font-bold ${futuresAccount.riskRatio > 80 ? 'text-red-700' : 'text-slate-800'}`}>{futuresAccount.riskRatio.toFixed(1)}%</span>
                  </div>
                  {futuresAccount.riskRatio > 80 && (
                    <div className="p-2 bg-red-100 text-red-800 text-xs rounded flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      风险度过高，请追加保证金或减仓！
                    </div>
                  )}
                </div>
              </div>

              {/* 快速交易 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-purple-600" />
                  快速交易
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">合约</label>
                    <select value={futuresTradeForm.contractCode} onChange={(e) => setFuturesTradeForm({...futuresTradeForm, contractCode: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-purple-500 outline-none">
                      {FUTURES_CONTRACTS.map(c => (<option key={c.code} value={c.code}>{c.code} - {c.name}</option>))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setFuturesTradeForm({...futuresTradeForm, direction: 'long'})} className={`py-2 px-4 rounded-lg font-medium flex items-center justify-center gap-1 ${futuresTradeForm.direction === 'long' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <TrendingUp className="w-4 h-4" />做多
                    </button>
                    <button onClick={() => setFuturesTradeForm({...futuresTradeForm, direction: 'short'})} className={`py-2 px-4 rounded-lg font-medium flex items-center justify-center gap-1 ${futuresTradeForm.direction === 'short' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <TrendingDown className="w-4 h-4" />做空
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setFuturesTradeForm({...futuresTradeForm, action: 'open'})} className={`py-2 px-4 rounded-lg font-medium text-sm ${futuresTradeForm.action === 'open' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>开仓</button>
                    <button onClick={() => setFuturesTradeForm({...futuresTradeForm, action: 'close'})} className={`py-2 px-4 rounded-lg font-medium text-sm ${futuresTradeForm.action === 'close' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600'}`}>平仓</button>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">价格</label>
                    <div className="flex gap-2">
                      <input type="number" step="0.1" value={futuresTradeForm.price} onChange={(e) => setFuturesTradeForm({...futuresTradeForm, price: e.target.value})} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg" placeholder={marketPrices[futuresTradeForm.contractCode]?.toString() || '0.00'} />
                      <button onClick={() => setFuturesTradeForm({...futuresTradeForm, price: marketPrices[futuresTradeForm.contractCode]?.toString() || ''})} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm">最新价</button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">手数</label>
                    <input type="number" value={futuresTradeForm.hands} onChange={(e) => setFuturesTradeForm({...futuresTradeForm, hands: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg" min="1" />
                  </div>

                  {futuresTradeForm.price && futuresTradeForm.hands && (
                    <div className="bg-slate-50 p-3 rounded-lg space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600">保证金：</span><span className="font-medium">¥{(Number(futuresTradeForm.price) * (FUTURES_CONTRACTS.find(c => c.code === futuresTradeForm.contractCode)?.multiplier || 0) * Number(futuresTradeForm.hands) * (FUTURES_CONTRACTS.find(c => c.code === futuresTradeForm.contractCode)?.marginRate || 0)).toFixed(0)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">手续费：</span><span className="font-medium">¥{((FUTURES_CONTRACTS.find(c => c.code === futuresTradeForm.contractCode)?.feePerHand || 0) * Number(futuresTradeForm.hands)).toFixed(2)}</span></div>
                    </div>
                  )}

                  <button onClick={executeFuturesTrade} disabled={!futuresTradeForm.price || !futuresTradeForm.hands} className={`w-full py-3 rounded-lg font-bold text-white disabled:opacity-50 ${futuresTradeForm.action === 'open' ? (futuresTradeForm.direction === 'long' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700') : 'bg-orange-600 hover:bg-orange-700'}`}>
                    {futuresTradeForm.action === 'open' ? (futuresTradeForm.direction === 'long' ? '买入开仓' : '卖出开仓') : (futuresTradeForm.direction === 'long' ? '卖出平仓' : '买入平仓')}
                  </button>
                </div>
              </div>

              {/* 行情报价 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200"><h3 className="font-bold text-slate-800">行情报价</h3></div>
                <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                  {FUTURES_CONTRACTS.map(contract => {
                    const price = marketPrices[contract.code] || 0;
                    return (
                      <div key={contract.code} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <div className="font-bold text-slate-800">{contract.code}</div>
                          <div className="text-xs text-slate-500">{contract.name}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <input type="number" step={contract.minPriceUnit} value={price} onChange={(e) => updateMarketPrice(contract.code, Number(e.target.value))} className="w-24 px-2 py-1 text-right font-mono font-bold border border-slate-300 rounded" />
                          <button onClick={() => { setFuturesTradeForm(prev => ({ ...prev, contractCode: contract.code, price: marketPrices[contract.code]?.toString() || '' })); }} className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200">交易</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 右侧持仓与详情 */}
            <div className="lg:col-span-2 space-y-6">
              {/* 持仓列表 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800">当前持仓 ({futuresPositions.length})</h3>
                  <div className="text-sm text-slate-500">浮动盈亏：<span className={futuresAccount.floatingProfit >= 0 ? 'text-red-600' : 'text-green-600'}>{futuresAccount.floatingProfit >= 0 ? '+' : ''}¥{futuresAccount.floatingProfit.toFixed(2)}</span></div>
                </div>
                {futuresPositions.length === 0 ? (
                  <div className="p-12 text-center text-slate-400"><Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>暂无持仓，请在左侧进行交易</p></div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {futuresPositions.map(pos => {
                      const currentPrice = marketPrices[pos.contract.code] || pos.avgPrice;
                      const floatingProfit = (currentPrice - pos.avgPrice) * pos.contract.multiplier * pos.totalHands * (pos.direction === 'long' ? 1 : -1);
                      const liquidPrice = calculateLiquidationPrice(pos);

                      return (
                        <div key={pos.id} className={`p-4 cursor-pointer transition-colors ${selectedFuturesId === pos.id ? 'bg-purple-50 border-l-4 border-purple-600' : 'hover:bg-slate-50 border-l-4 border-transparent'}`} onClick={() => setSelectedFuturesId(pos.id)}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${pos.direction === 'long' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{pos.direction === 'long' ? '多' : '空'}</span>
                              <div>
                                <div className="font-bold text-slate-900">{pos.contract.code}</div>
                                <div className="text-xs text-slate-500">{pos.contract.name}</div>
                              </div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); if (confirm('确定删除该持仓记录？')) { setFuturesPositions(futuresPositions.filter(p => p.id !== pos.id)); } }} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div><div className="text-slate-500 text-xs">持仓均价</div><div className="font-mono font-bold">{pos.avgPrice.toFixed(1)}</div></div>
                            <div><div className="text-slate-500 text-xs">最新价</div><div className="font-mono font-bold">{currentPrice.toFixed(1)}</div></div>
                            <div><div className="text-slate-500 text-xs">手数</div><div className="font-bold">{pos.totalHands}</div></div>
                            <div><div className="text-slate-500 text-xs">浮动盈亏</div><div className={`font-bold ${floatingProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>{floatingProfit >= 0 ? '+' : ''}{floatingProfit.toFixed(0)}</div></div>
                          </div>
                          {((pos.direction === 'long' && currentPrice <= liquidPrice) || (pos.direction === 'short' && currentPrice >= liquidPrice)) && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded flex items-center gap-2 text-red-800 text-xs"><ShieldAlert className="w-4 h-4" /><span>已触及强平价 {liquidPrice.toFixed(1)}，请注意风险！</span></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 选中持仓详情 */}
              {selectedFutures && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{selectedFutures.contract.code}<span className={`ml-2 px-2 py-1 rounded text-sm ${selectedFutures.direction === 'long' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{selectedFutures.direction === 'long' ? '多头' : '空头'}</span></h3>
                      <p className="text-slate-500">{selectedFutures.contract.name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-500">强平价预估</div>
                      <div className="text-xl font-bold text-orange-600">{calculateLiquidationPrice(selectedFutures).toFixed(1)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {(() => {
                      const currentPrice = marketPrices[selectedFutures.contract.code] || selectedFutures.avgPrice;
                      const floating = (currentPrice - selectedFutures.avgPrice) * selectedFutures.contract.multiplier * selectedFutures.totalHands * (selectedFutures.direction === 'long' ? 1 : -1);
                      return (<>
                        <div className="bg-slate-50 p-3 rounded-lg"><div className="text-xs text-slate-500">开仓均价</div><div className="text-lg font-bold">{selectedFutures.avgPrice.toFixed(1)}</div></div>
                        <div className="bg-slate-50 p-3 rounded-lg"><div className="text-xs text-slate-500">当前价格</div><div className="text-lg font-bold">{currentPrice.toFixed(1)}</div></div>
                        <div className="bg-slate-50 p-3 rounded-lg"><div className="text-xs text-slate-500">占用保证金</div><div className="text-lg font-bold text-blue-600">¥{selectedFutures.occupiedMargin.toFixed(0)}</div></div>
                        <div className={`p-3 rounded-lg ${floating >= 0 ? 'bg-red-50' : 'bg-green-50'}`}><div className="text-xs text-slate-500">浮动盈亏</div><div className={`text-lg font-bold ${floating >= 0 ? 'text-red-600' : 'text-green-600'}`}>{floating >= 0 ? '+' : ''}¥{floating.toFixed(0)}</div></div>
                      </>);
                    })()}
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <h4 className="font-bold text-slate-800 mb-3">交易记录</h4>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {selectedFutures.trades.map(trade => (
                        <div key={trade.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${trade.action === 'open' ? (trade.direction === 'long' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700') : 'bg-orange-100 text-orange-700'}`}>{trade.action === 'open' ? (trade.direction === 'long' ? '多开' : '空开') : '平仓'}</span>
                            <span className="text-slate-600">{trade.date}</span>
                            <span className="font-mono">{trade.price} × {trade.hands}手</span>
                          </div>
                          <div className="text-right">
                            {trade.profit !== undefined && <div className={`font-bold ${trade.profit >= 0 ? 'text-red-600' : 'text-green-600'}`}>{trade.profit >= 0 ? '+' : ''}¥{trade.profit.toFixed(2)}</div>}
                            <div className="text-xs text-slate-500">手续费: ¥{trade.fee}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
