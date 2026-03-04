import { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  BarChart3,
  ShieldAlert,
  ChevronDown,
  RotateCcw,
  Settings,
  Target,
  Plus,
  Trash2,
  Save,
  AlertTriangle,
  CheckCircle,
  X,
  Calendar,
  Percent,
  DollarSign,
  TrendingFlat
} from 'lucide-react';

// ==================== 类型定义 ====================

type TradeMode = 'stock' | 'futures';
type TradeDirection = 'buy' | 'sell';

// 做T记录
interface TTrade {
  id: string;
  date: string;
  direction: 'buy_first' | 'sell_first'; // 先买后卖 或 先卖后买
  price: number;
  quantity: number;
  closePrice?: number; // 做T平仓价格
  profit: number; // 已实现盈亏
  status: 'open' | 'closed'; // 是否完成做T
}

// 持仓标的
interface Position {
  id: string;
  code: string;
  name: string;
  mode: TradeMode;
  // 基础信息
  buyPrice: number;
  quantity: number;
  currentPrice: number;
  // 费用设置（每个标的独立，默认用全局）
  commissionRate: number; // 万分之
  minCommission: number;
  stampDutyRate: number; // 万分之
  transferFeeRate: number; // 万分之
  // 做T记录
  tTrades: TTrade[];
  // 策略设置
  stopLossConfig: {
    enabled: boolean;
    pauseThreshold: number; // -8%
    pauseDays: number; // 3天
    halfPositionThreshold: number; // -15%
    clearThreshold: number; // -20%
  };
  takeProfitConfig: {
    enabled: boolean;
    steps: { profitPercent: number; reducePercent: number }[]; // 阶梯止盈
  };
  // 状态
  isPaused: boolean; // 是否暂停交易
  pauseEndDate?: string; // 暂停结束日期
  createdAt: string;
}

// 期货合约配置
const FUTURES_CONTRACTS = [
  { code: 'IF', name: '沪深300股指', multiplier: 300, marginRate: 0.12, minPriceUnit: 0.2, exchange: 'CFFEX' },
  { code: 'IC', name: '中证500股指', multiplier: 200, marginRate: 0.12, minPriceUnit: 0.2, exchange: 'CFFEX' },
  { code: 'IH', name: '上证50股指', multiplier: 300, marginRate: 0.12, minPriceUnit: 0.2, exchange: 'CFFEX' },
  { code: 'RB', name: '螺纹钢', multiplier: 10, marginRate: 0.09, minPriceUnit: 1, exchange: 'SHFE' },
  { code: 'CU', name: '铜', multiplier: 5, marginRate: 0.10, minPriceUnit: 10, exchange: 'SHFE' },
  { code: 'AU', name: '黄金', multiplier: 1000, marginRate: 0.08, minPriceUnit: 0.02, exchange: 'SHFE' },
  { code: 'AG', name: '白银', multiplier: 15, marginRate: 0.12, minPriceUnit: 1, exchange: 'SHFE' },
  { code: 'C', name: '玉米', multiplier: 10, marginRate: 0.08, minPriceUnit: 1, exchange: 'DCE' },
  { code: 'SC', name: '原油', multiplier: 1000, marginRate: 0.10, minPriceUnit: 0.1, exchange: 'INE' },
];

// ==================== 辅助函数 ====================

const generateId = () => Math.random().toString(36).substr(2, 9);

const formatDate = (date: Date) => date.toISOString().split('T')[0];

const calculateHoldingCost = (position: Position): number => {
  let totalCost = position.buyPrice * position.quantity;
  let totalQty = position.quantity;
  
  // 计算做T对成本的影响
  position.tTrades.forEach(t => {
    if (t.direction === 'buy_first' && t.status === 'closed') {
      // 先买后卖：低价买入高价卖出，降低原持仓成本
      totalCost += t.price * t.quantity - t.closePrice! * t.quantity;
    } else if (t.direction === 'sell_first' && t.status === 'closed') {
      // 先卖后买：高价卖出低价买回，降低原持仓成本
      totalCost -= t.price * t.quantity - t.closePrice! * t.quantity;
    }
  });
  
  return totalQty > 0 ? totalCost / totalQty : 0;
};

// ==================== 主组件 ====================

export default function TradingCalculator() {
  // 全局模式
  const [mode, setMode] = useState<TradeMode>('stock');
  const [activeTab, setActiveTab] = useState<'positions' | 'ttrade' | 'strategy'>('positions');
  
  // 数据持久化 - 持仓列表
  const [positions, setPositions] = useState<Position[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('trading-positions');
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
  
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  
  // 新建持仓表单
  const [showNewPositionForm, setShowNewPositionForm] = useState(false);
  const [newPosition, setNewPosition] = useState<Partial<Position>>({
    mode: 'stock',
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
        { profitPercent: 100, reducePercent: 60 } // 减到保留10%
      ]
    }
  });

  // 做T表单
  const [tForm, setTForm] = useState({
    direction: 'buy_first' as 'buy_first' | 'sell_first',
    price: '',
    quantity: '',
    closePrice: ''
  });

  // 保存数据到localStorage
  useEffect(() => {
    localStorage.setItem('trading-positions', JSON.stringify(positions));
  }, [positions]);

  // 当前选中持仓
  const currentPosition = useMemo(() => 
    positions.find(p => p.id === selectedPositionId),
    [positions, selectedPositionId]
  );

  // 计算持仓数据
  const calculatePositionData = (position: Position) => {
    const holdingCost = calculateHoldingCost(position);
    const marketValue = position.currentPrice * position.quantity;
    const costBasis = holdingCost * position.quantity;
    const unrealizedProfit = marketValue - costBasis;
    const unrealizedProfitRate = costBasis > 0 ? (unrealizedProfit / costBasis) * 100 : 0;
    
    // 已实现盈亏（来自做T）
    const realizedProfit = position.tTrades
      .filter(t => t.status === 'closed')
      .reduce((sum, t) => sum + t.profit, 0);
    
    // 总盈亏
    const totalProfit = unrealizedProfit + realizedProfit;
    
    // 买入成本明细
    const buyAmount = position.buyPrice * position.quantity;
    const buyCommission = Math.max(buyAmount * (position.commissionRate / 10000), position.minCommission);
    const buyTransferFee = buyAmount * (position.transferFeeRate / 10000);
    
    // 当前卖出费用（预估）
    const sellAmount = position.currentPrice * position.quantity;
    const sellCommission = Math.max(sellAmount * (position.commissionRate / 10000), position.minCommission);
    const sellStampDuty = sellAmount * (position.stampDutyRate / 10000);
    const sellTransferFee = sellAmount * (position.transferFeeRate / 10000);
    const totalSellFee = sellCommission + sellStampDuty + sellTransferFee;
    
    // 保本价计算
    const breakEvenPrice = position.quantity > 0 
      ? (costBasis + buyCommission + buyTransferFee + position.minCommission) / 
        (position.quantity * (1 - position.commissionRate/10000 - position.stampDutyRate/10000 - position.transferFeeRate/10000))
      : 0;
    
    return {
      holdingCost,
      marketValue,
      costBasis,
      unrealizedProfit,
      unrealizedProfitRate,
      realizedProfit,
      totalProfit,
      buyCommission,
      buyTransferFee,
      sellCommission,
      sellStampDuty,
      sellTransferFee,
      totalSellFee,
      breakEvenPrice
    };
  };

  // 策略提醒
  const getStrategyAlerts = (position: Position) => {
    const alerts: { type: 'warning' | 'success' | 'danger'; message: string }[] = [];
    const data = calculatePositionData(position);
    const profitRate = data.unrealizedProfitRate;
    
    // 止盈检查
    if (position.takeProfitConfig.enabled) {
      const steps = position.takeProfitConfig.steps;
      for (const step of steps) {
        if (profitRate >= step.profitPercent) {
          alerts.push({
            type: 'success',
            message: `已达到止盈点 ${step.profitPercent}%，建议减仓 ${step.reducePercent}%`
          });
        }
      }
    }
    
    // 止损检查
    if (position.stopLossConfig.enabled && !position.isPaused) {
      const { pauseThreshold, halfPositionThreshold, clearThreshold } = position.stopLossConfig;
      
      if (profitRate <= clearThreshold) {
        alerts.push({
          type: 'danger',
          message: `已达到清仓线 ${clearThreshold}%，建议立即清仓！`
        });
      } else if (profitRate <= halfPositionThreshold) {
        alerts.push({
          type: 'warning',
          message: `已达到半仓线 ${halfPositionThreshold}%，建议减持一半仓位`
        });
      } else if (profitRate <= pauseThreshold) {
        alerts.push({
          type: 'warning',
          message: `已达到暂停线 ${pauseThreshold}%，建议暂停交易 ${position.stopLossConfig.pauseDays} 天`
        });
      }
    }
    
    if (position.isPaused && position.pauseEndDate) {
      const today = new Date();
      const endDate = new Date(position.pauseEndDate);
      if (today < endDate) {
        alerts.push({
          type: 'warning',
          message: `交易暂停中，恢复日期：${position.pauseEndDate}`
        });
      }
    }
    
    return alerts;
  };

  // 添加新持仓
  const addPosition = () => {
    if (!newPosition.code || !newPosition.buyPrice || !newPosition.quantity) return;
    
    const position: Position = {
      id: generateId(),
      code: newPosition.code.toUpperCase(),
      name: newPosition.name || newPosition.code!.toUpperCase(),
      mode: newPosition.mode || 'stock',
      buyPrice: Number(newPosition.buyPrice),
      quantity: Number(newPosition.quantity),
      currentPrice: Number(newPosition.buyPrice),
      commissionRate: Number(newPosition.commissionRate) || 3,
      minCommission: Number(newPosition.minCommission) || 5,
      stampDutyRate: Number(newPosition.stampDutyRate) || 10,
      transferFeeRate: Number(newPosition.transferFeeRate) || 0.1,
      tTrades: [],
      stopLossConfig: newPosition.stopLossConfig!,
      takeProfitConfig: newPosition.takeProfitConfig!,
      isPaused: false,
      createdAt: formatDate(new Date())
    };
    
    setPositions([...positions, position]);
    setSelectedPositionId(position.id);
    setShowNewPositionForm(false);
    setNewPosition({
      mode: 'stock',
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

  // 删除持仓
  const deletePosition = (id: string) => {
    setPositions(positions.filter(p => p.id !== id));
    if (selectedPositionId === id) {
      setSelectedPositionId(null);
    }
  };

  // 更新当前价格
  const updateCurrentPrice = (id: string, price: number) => {
    setPositions(positions.map(p => 
      p.id === id ? { ...p, currentPrice: price } : p
    ));
  };

  // 添加做T记录
  const addTTrade = () => {
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
    
    // 计算已实现盈亏
    if (tTrade.status === 'closed' && tTrade.closePrice) {
      if (tTrade.direction === 'buy_first') {
        // 先买后卖：利润 = (卖价 - 买价) * 数量
        tTrade.profit = (tTrade.closePrice - tTrade.price) * tTrade.quantity;
      } else {
        // 先卖后买：利润 = (卖价 - 买价) * 数量（这里的price是卖出价）
        tTrade.profit = (tTrade.price - tTrade.closePrice) * tTrade.quantity;
      }
    }
    
    setPositions(positions.map(p => 
      p.id === currentPosition.id 
        ? { ...p, tTrades: [...p.tTrades, tTrade] }
        : p
    ));
    
    setTForm({
      direction: 'buy_first',
      price: '',
      quantity: '',
      closePrice: ''
    });
  };

  // 关闭做T（平仓）
  const closeTTrade = (tradeId: string, closePrice: number) => {
    if (!currentPosition) return;
    
    setPositions(positions.map(p => {
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
          
          return {
            ...t,
            closePrice,
            profit,
            status: 'closed' as const
          };
        })
      };
    }));
  };

  // 执行策略操作（暂停/减仓等）
  const executeStrategy = (action: 'pause' | 'half' | 'clear') => {
    if (!currentPosition) return;
    
    switch (action) {
      case 'pause': {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + currentPosition.stopLossConfig.pauseDays);
        setPositions(positions.map(p => 
          p.id === currentPosition.id 
            ? { ...p, isPaused: true, pauseEndDate: formatDate(endDate) }
            : p
        ));
        break;
      }
      case 'half': {
        // 半仓减持：减少一半数量，已实现盈亏保持不变
        setPositions(positions.map(p => 
          p.id === currentPosition.id 
            ? { ...p, quantity: Math.floor(p.quantity / 2) }
            : p
        ));
        break;
      }
      case 'clear': {
        // 清仓：删除持仓或标记为已清仓（这里选择保留记录但标记为0持仓）
        setPositions(positions.map(p => 
          p.id === currentPosition.id 
            ? { ...p, quantity: 0 }
            : p
        ));
        break;
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Calculator className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">智能交易管理系统</h1>
              <p className="text-slate-500 text-sm">多标的·做T·策略·止盈止损</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewPositionForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建持仓
            </button>
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setMode('stock')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  mode === 'stock' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                股票
              </button>
              <button
                onClick={() => setMode('futures')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  mode === 'futures' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-600'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                期货
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 左侧持仓列表 */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="font-bold text-slate-800">持仓列表</h3>
                <p className="text-xs text-slate-500 mt-1">共 {positions.length} 个标的</p>
              </div>
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {positions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    暂无持仓，点击右上角添加
                  </div>
                ) : (
                  positions.map(position => {
                    const data = calculatePositionData(position);
                    const alerts = getStrategyAlerts(position);
                    return (
                      <button
                        key={position.id}
                        onClick={() => setSelectedPositionId(position.id)}
                        className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${
                          selectedPositionId === position.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'
                        } ${position.quantity === 0 ? 'opacity-50' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-bold text-slate-800">{position.code}</span>
                            <span className="text-xs text-slate-500 ml-2">{position.name}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePosition(position.id);
                            }}
                            className="text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">持仓 {position.quantity} 股</span>
                          <span className={`font-bold ${data.unrealizedProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {data.unrealizedProfit >= 0 ? '+' : ''}{data.unrealizedProfitRate.toFixed(1)}%
                          </span>
                        </div>
                        {alerts.length > 0 && position.quantity > 0 && (
                          <div className="mt-2 flex items-center gap-1 text-xs">
                            <AlertTriangle className={`w-3 h-3 ${
                              alerts[0].type === 'danger' ? 'text-red-600' : 
                              alerts[0].type === 'success' ? 'text-green-600' : 'text-yellow-600'
                            }`} />
                            <span className={`${
                              alerts[0].type === 'danger' ? 'text-red-600' : 
                              alerts[0].type === 'success' ? 'text-green-600' : 'text-yellow-600'
                            }`}>
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
            {!currentPosition ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-400">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>选择左侧持仓查看详情，或添加新持仓</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 标的头部信息 */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">{currentPosition.code}</h2>
                      <p className="text-slate-500">{currentPosition.name}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-slate-500">当前价格</div>
                        <input
                          type="number"
                          value={currentPosition.currentPrice}
                          onChange={(e) => updateCurrentPrice(currentPosition.id, Number(e.target.value))}
                          className="w-32 px-3 py-2 text-right font-bold text-lg border border-slate-300 rounded-lg focus:border-blue-500 outline-none"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 快捷操作按钮 */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setActiveTab('positions')}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        activeTab === 'positions' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      持仓概览
                    </button>
                    <button
                      onClick={() => setActiveTab('ttrade')}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        activeTab === 'ttrade' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      做T记录 ({currentPosition.tTrades.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('strategy')}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        activeTab === 'strategy' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      策略设置
                    </button>
                  </div>
                </div>

                {/* 策略提醒横幅 */}
                {(() => {
                  const alerts = getStrategyAlerts(currentPosition);
                  if (alerts.length === 0 || currentPosition.quantity === 0) return null;
                  return (
                    <div className="space-y-2">
                      {alerts.map((alert, idx) => (
                        <div 
                          key={idx} 
                          className={`p-4 rounded-xl flex items-center justify-between ${
                            alert.type === 'danger' ? 'bg-red-50 border border-red-200 text-red-800' :
                            alert.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
                            'bg-yellow-50 border border-yellow-200 text-yellow-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {alert.type === 'danger' ? <ShieldAlert className="w-5 h-5" /> :
                             alert.type === 'success' ? <CheckCircle className="w-5 h-5" /> :
                             <AlertTriangle className="w-5 h-5" />}
                            <span className="font-medium">{alert.message}</span>
                          </div>
                          {alert.message.includes('暂停') && !currentPosition.isPaused && (
                            <button 
                              onClick={() => executeStrategy('pause')}
                              className="px-3 py-1 bg-white rounded-lg text-sm font-medium hover:bg-slate-50"
                            >
                              执行暂停
                            </button>
                          )}
                          {alert.message.includes('半仓') && (
                            <button 
                              onClick={() => executeStrategy('half')}
                              className="px-3 py-1 bg-white rounded-lg text-sm font-medium hover:bg-slate-50"
                            >
                              执行减仓
                            </button>
                          )}
                          {alert.message.includes('清仓') && (
                            <button 
                              onClick={() => executeStrategy('clear')}
                              className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                            >
                              执行清仓
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* 持仓概览 */}
                {activeTab === 'positions' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {(() => {
                      const data = calculatePositionData(currentPosition);
                      return (
                        <>
                          {/* 成本与盈亏 */}
                          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <DollarSign className="w-5 h-5 text-blue-600" />
                              成本与盈亏
                            </h3>
                            <div className="space-y-3">
                              <div className="flex justify-between">
                                <span className="text-slate-600">持仓成本</span>
                                <span className="font-bold">¥{data.holdingCost.toFixed(3)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">当前市值</span>
                                <span className="font-bold">¥{data.marketValue.toFixed(2)}</span>
                              </div>
                              <div className="h-px bg-slate-200 my-2" />
                              <div className="flex justify-between">
                                <span className="text-slate-600">持仓盈亏</span>
                                <span className={`font-bold ${data.unrealizedProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {data.unrealizedProfit >= 0 ? '+' : ''}¥{data.unrealizedProfit.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">做T已实现</span>
                                <span className={`font-bold ${data.realizedProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {data.realizedProfit >= 0 ? '+' : ''}¥{data.realizedProfit.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between text-lg font-bold">
                                <span>总盈亏</span>
                                <span className={data.totalProfit >= 0 ? 'text-red-600' : 'text-green-600'}>
                                  {data.totalProfit >= 0 ? '+' : ''}¥{data.totalProfit.toFixed(2)}
                                </span>
                              </div>
                              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                                <div className="text-sm text-blue-800 mb-1">保本价</div>
                                <div className="text-xl font-bold text-blue-700">¥{data.breakEvenPrice.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>

                          {/* 费用明细 */}
                          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <Percent className="w-5 h-5 text-green-600" />
                              费用明细
                            </h3>
                            <div className="space-y-3 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-600">买入佣金</span>
                                <span className="text-red-600">-¥{data.buyCommission.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">买入过户费</span>
                                <span className="text-red-600">-¥{data.buyTransferFee.toFixed(2)}</span>
                              </div>
                              <div className="h-px bg-slate-200 my-2" />
                              <div className="text-xs text-slate-500 mb-2">预估卖出费用：</div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">卖出佣金</span>
                                <span className="text-red-600">-¥{data.sellCommission.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">印花税</span>
                                <span className="text-red-600">-¥{data.sellStampDuty.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">卖出过户费</span>
                                <span className="text-red-600">-¥{data.sellTransferFee.toFixed(2)}</span>
                              </div>
                              <div className="h-px bg-slate-200 my-2" />
                              <div className="flex justify-between font-bold">
                                <span>卖出总费用</span>
                                <span className="text-red-600">¥{data.totalSellFee.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>

                          {/* 费率设置 */}
                          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <Settings className="w-5 h-5 text-purple-600" />
                              费率设置
                            </h3>
                            <div className="space-y-3">
                              <div>
                                <label className="text-xs text-slate-500">佣金费率 (‱)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={currentPosition.commissionRate}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setPositions(positions.map(p => 
                                      p.id === currentPosition.id ? { ...p, commissionRate: val } : p
                                    ));
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-purple-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500">最低佣金 (元)</label>
                                <input
                                  type="number"
                                  value={currentPosition.minCommission}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setPositions(positions.map(p => 
                                      p.id === currentPosition.id ? { ...p, minCommission: val } : p
                                    ));
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-purple-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500">印花税率 (‱)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={currentPosition.stampDutyRate}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setPositions(positions.map(p => 
                                      p.id === currentPosition.id ? { ...p, stampDutyRate: val } : p
                                    ));
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-purple-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500">过户费率 (‱)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={currentPosition.transferFeeRate}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setPositions(positions.map(p => 
                                      p.id === currentPosition.id ? { ...p, transferFeeRate: val } : p
                                    ));
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-purple-500 outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 做T记录 */}
                {activeTab === 'ttrade' && (
                  <div className="space-y-6">
                    {/* 添加做T表单 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-600" />
                        新增做T记录
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">操作方向</label>
                          <select
                            value={tForm.direction}
                            onChange={(e) => setTForm({...tForm, direction: e.target.value as any})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                          >
                            <option value="buy_first">先买后卖（正向T）</option>
                            <option value="sell_first">先卖后买（反向T）</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">
                            {tForm.direction === 'buy_first' ? '买入价格' : '卖出价格'} (元)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={tForm.price}
                            onChange={(e) => setTForm({...tForm, price: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">数量 (股)</label>
                          <input
                            type="number"
                            value={tForm.quantity}
                            onChange={(e) => setTForm({...tForm, quantity: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                            placeholder="100"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">
                            平仓价格 (元) {tForm.direction === 'buy_first' ? '【卖出价】' : '【买回价】'}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.01"
                              value={tForm.closePrice}
                              onChange={(e) => setTForm({...tForm, closePrice: e.target.value})}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                              placeholder="可选，不填则标记为未平仓"
                            />
                            <button
                              onClick={addTTrade}
                              disabled={!tForm.price || !tForm.quantity}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              添加
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        * 做T会自动影响持仓成本计算。正向T（先买后卖）盈利则降低成本，反向T（先卖后买）盈利同样降低成本。
                      </p>
                    </div>

                    {/* 做T记录列表 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <h3 className="font-bold text-slate-800">做T历史记录</h3>
                      </div>
                      {currentPosition.tTrades.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          暂无做T记录
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {currentPosition.tTrades.map((trade) => (
                            <div key={trade.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                  trade.direction === 'buy_first' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
                                }`}>
                                  {trade.direction === 'buy_first' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                </div>
                                <div>
                                  <div className="font-medium text-slate-800">
                                    {trade.direction === 'buy_first' ? '先买后卖' : '先卖后买'} 
                                    <span className="text-sm text-slate-500 ml-2">{trade.date}</span>
                                  </div>
                                  <div className="text-sm text-slate-600">
                                    {trade.price}元 × {trade.quantity}股
                                    {trade.closePrice && ` → ${trade.closePrice}元`}
                                  </div>
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
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder="平仓价"
                                      className="w-24 px-2 py-1 text-sm border border-slate-300 rounded"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          closeTTrade(trade.id, Number((e.target as HTMLInputElement).value));
                                        }
                                      }}
                                    />
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
                {activeTab === 'strategy' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 止盈设置 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-red-600" />
                          阶梯止盈策略
                        </h3>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={currentPosition.takeProfitConfig.enabled}
                            onChange={(e) => {
                              setPositions(positions.map(p => 
                                p.id === currentPosition.id 
                                  ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, enabled: e.target.checked } }
                                  : p
                              ));
                            }}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm">启用</span>
                        </label>
                      </div>
                      
                      {currentPosition.takeProfitConfig.steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-4 mb-3 p-3 bg-slate-50 rounded-lg">
                          <div className="flex-1">
                            <label className="text-xs text-slate-500 block">盈利达到</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={step.profitPercent}
                                onChange={(e) => {
                                  const newSteps = [...currentPosition.takeProfitConfig.steps];
                                  newSteps[idx].profitPercent = Number(e.target.value);
                                  setPositions(positions.map(p => 
                                    p.id === currentPosition.id 
                                      ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, steps: newSteps } }
                                      : p
                                  ));
                                }}
                                className="w-20 px-2 py-1 border border-slate-300 rounded"
                              />
                              <span>%</span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-slate-500 block">减仓</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={step.reducePercent}
                                onChange={(e) => {
                                  const newSteps = [...currentPosition.takeProfitConfig.steps];
                                  newSteps[idx].reducePercent = Number(e.target.value);
                                  setPositions(positions.map(p => 
                                    p.id === currentPosition.id 
                                      ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, steps: newSteps } }
                                      : p
                                  ));
                                }}
                                className="w-20 px-2 py-1 border border-slate-300 rounded"
                              />
                              <span>%</span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const newSteps = currentPosition.takeProfitConfig.steps.filter((_, i) => i !== idx);
                              setPositions(positions.map(p => 
                                p.id === currentPosition.id 
                                  ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, steps: newSteps } }
                                  : p
                              ));
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      
                      <button
                        onClick={() => {
                          const newSteps = [...currentPosition.takeProfitConfig.steps, { profitPercent: 50, reducePercent: 20 }];
                          setPositions(positions.map(p => 
                            p.id === currentPosition.id 
                              ? { ...p, takeProfitConfig: { ...p.takeProfitConfig, steps: newSteps } }
                              : p
                          ));
                        }}
                        className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-500 hover:text-blue-600 transition-colors"
                      >
                        + 添加止盈阶梯
                      </button>
                      
                      <div className="mt-4 text-xs text-slate-500 bg-blue-50 p-3 rounded-lg">
                        <p>建议策略：</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li>30%盈利减仓30%，锁定部分利润</li>
                          <li>60%盈利再减仓30%，保留核心仓位</li>
                          <li>100%盈利减仓至10%，让利润奔跑但控制风险</li>
                        </ul>
                      </div>
                    </div>

                    {/* 止损设置 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-green-600" />
                          阶梯止损策略
                        </h3>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={currentPosition.stopLossConfig.enabled}
                            onChange={(e) => {
                              setPositions(positions.map(p => 
                                p.id === currentPosition.id 
                                  ? { ...p, stopLossConfig: { ...p.stopLossConfig, enabled: e.target.checked } }
                                  : p
                              ));
                            }}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm">启用</span>
                        </label>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-yellow-800">暂停交易线</span>
                            <span className="text-xs text-yellow-600">短期调整</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>跌幅达</span>
                            <input
                              type="number"
                              value={currentPosition.stopLossConfig.pauseThreshold}
                              onChange={(e) => {
                                setPositions(positions.map(p => 
                                  p.id === currentPosition.id 
                                    ? { ...p, stopLossConfig: { ...p.stopLossConfig, pauseThreshold: Number(e.target.value) } }
                                    : p
                                ));
                              }}
                              className="w-20 px-2 py-1 border border-yellow-300 rounded text-center"
                            />
                            <span>%，暂停</span>
                            <input
                              type="number"
                              value={currentPosition.stopLossConfig.pauseDays}
                              onChange={(e) => {
                                setPositions(positions.map(p => 
                                  p.id === currentPosition.id 
                                    ? { ...p, stopLossConfig: { ...p.stopLossConfig, pauseDays: Number(e.target.value) } }
                                    : p
                                ));
                              }}
                              className="w-16 px-2 py-1 border border-yellow-300 rounded text-center"
                            />
                            <span>天</span>
                          </div>
                        </div>
                        
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-orange-800">半仓减持线</span>
                            <span className="text-xs text-orange-600">中期调整</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>跌幅达</span>
                            <input
                              type="number"
                              value={currentPosition.stopLossConfig.halfPositionThreshold}
                              onChange={(e) => {
                                setPositions(positions.map(p => 
                                  p.id === currentPosition.id 
                                    ? { ...p, stopLossConfig: { ...p.stopLossConfig, halfPositionThreshold: Number(e.target.value) } }
                                    : p
                                ));
                              }}
                              className="w-20 px-2 py-1 border border-orange-300 rounded text-center"
                            />
                            <span>%，减半仓位</span>
                          </div>
                        </div>
                        
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-red-800">清仓退场线</span>
                            <span className="text-xs text-red-600">风险失控</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>跌幅达</span>
                            <input
                              type="number"
                              value={currentPosition.stopLossConfig.clearThreshold}
                              onChange={(e) => {
                                setPositions(positions.map(p => 
                                  p.id === currentPosition.id 
                                    ? { ...p, stopLossConfig: { ...p.stopLossConfig, clearThreshold: Number(e.target.value) } }
                                    : p
                                ));
                              }}
                              className="w-20 px-2 py-1 border border-red-300 rounded text-center"
                            />
                            <span>%，全部清仓</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 text-xs text-slate-500 bg-green-50 p-3 rounded-lg">
                        <p>策略逻辑：</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li>-8%：短期波动，冷静观望3天避免情绪化交易</li>
                          <li>-15%：趋势可能逆转，减半仓位降低风险</li>
                          <li>-20%：深度回调，严格止损保护本金</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新建持仓弹窗 */}
      {showNewPositionForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">新建持仓</h3>
              <button 
                onClick={() => setShowNewPositionForm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">股票代码</label>
                  <input
                    type="text"
                    value={newPosition.code || ''}
                    onChange={(e) => setNewPosition({...newPosition, code: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none"
                    placeholder="如：000001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">股票名称</label>
                  <input
                    type="text"
                    value={newPosition.name || ''}
                    onChange={(e) => setNewPosition({...newPosition, name: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none"
                    placeholder="如：平安银行"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">买入价格 (元)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPosition.buyPrice || ''}
                    onChange={(e) => setNewPosition({...newPosition, buyPrice: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">买入数量 (股)</label>
                  <input
                    type="number"
                    value={newPosition.quantity || ''}
                    onChange={(e) => setNewPosition({...newPosition, quantity: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none"
                    placeholder="100"
                  />
                </div>
              </div>

              <div className="h-px bg-slate-200 my-4" />
              
              <div className="text-sm font-medium text-slate-700 mb-2">费用设置（可选，默认通用费率）</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">佣金费率 (‱)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newPosition.commissionRate}
                    onChange={(e) => setNewPosition({...newPosition, commissionRate: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">最低佣金 (元)</label>
                  <input
                    type="number"
                    value={newPosition.minCommission}
                    onChange={(e) => setNewPosition({...newPosition, minCommission: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowNewPositionForm(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
              >
                取消
              </button>
              <button
                onClick={addPosition}
                disabled={!newPosition.code || !newPosition.buyPrice || !newPosition.quantity}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                添加持仓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
