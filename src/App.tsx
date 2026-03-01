import { useState, useEffect } from 'react';
import { 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  Calculator, 
  Wallet, 
  AlertTriangle, 
  Info,
  RotateCcw,
  Activity,
  BarChart3,
  DollarSign,
  ShieldAlert,
  ChevronDown
} from 'lucide-react';

// 交易模式
type TradeMode = 'stock' | 'futures';
type TDirection = 'buy_first' | 'sell_first';
type FuturesDirection = 'long' | 'short';

// 期货合约配置
const FUTURES_CONTRACTS = [
  { code: 'IF', name: '沪深300股指', multiplier: 300, marginRate: 0.12, minPriceUnit: 0.2, exchange: 'CFFEX' },
  { code: 'IC', name: '中证500股指', multiplier: 200, marginRate: 0.12, minPriceUnit: 0.2, exchange: 'CFFEX' },
  { code: 'IH', name: '上证50股指', multiplier: 300, marginRate: 0.12, minPriceUnit: 0.2, exchange: 'CFFEX' },
  { code: 'RB', name: '螺纹钢', multiplier: 10, marginRate: 0.09, minPriceUnit: 1, exchange: 'SHFE' },
  { code: 'CU', name: '铜', multiplier: 5, marginRate: 0.10, minPriceUnit: 10, exchange: 'SHFE' },
  { code: 'AL', name: '铝', multiplier: 5, marginRate: 0.10, minPriceUnit: 5, exchange: 'SHFE' },
  { code: 'AU', name: '黄金', multiplier: 1000, marginRate: 0.08, minPriceUnit: 0.02, exchange: 'SHFE' },
  { code: 'AG', name: '白银', multiplier: 15, marginRate: 0.12, minPriceUnit: 1, exchange: 'SHFE' },
  { code: 'C', name: '玉米', multiplier: 10, marginRate: 0.08, minPriceUnit: 1, exchange: 'DCE' },
  { code: 'M', name: '豆粕', multiplier: 10, marginRate: 0.08, minPriceUnit: 1, exchange: 'DCE' },
  { code: 'SR', name: '白糖', multiplier: 10, marginRate: 0.07, minPriceUnit: 1, exchange: 'CZCE' },
  { code: 'CF', name: '棉花', multiplier: 5, marginRate: 0.07, minPriceUnit: 5, exchange: 'CZCE' },
  { code: 'SC', name: '原油', multiplier: 1000, marginRate: 0.10, minPriceUnit: 0.1, exchange: 'INE' },
];

// 结果类型
interface StockResult {
  profit: number;
  profitRate: number;
  buyCost: number;
  sellCost: number;
  totalCost: number;
  netProfit: number;
}

interface TResult {
  originalCost: number;
  newCost: number;
  costReduction: number;
  realizedProfit: number;
  totalQuantity: number;
}

interface FuturesResult {
  margin: number;
  maxLots: number;
  liquidationPrice: number;
  pricePerTick: number;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export default function App() {
  // 全局模式
  const [mode, setMode] = useState<TradeMode>('stock');
  const [activeTab, setActiveTab] = useState<'basic' | 't'>('basic');

  // 股票基础
  const [stockBuyPrice, setStockBuyPrice] = useState('');
  const [stockSellPrice, setStockSellPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [stockResult, setStockResult] = useState<StockResult | null>(null);

  // 做T
  const [tDirection, setTDirection] = useState<TDirection>('buy_first');
  const [originalCost, setOriginalCost] = useState('');
  const [originalQty, setOriginalQty] = useState('');
  const [tPrice, setTPrice] = useState('');
  const [tQty, setTQty] = useState('');
  const [tSellPrice, setTSellPrice] = useState('');
  const [tResult, setTResult] = useState<TResult | null>(null);

  // 期货
  const [selectedContract, setSelectedContract] = useState(FUTURES_CONTRACTS[0]);
  const [futuresPrice, setFuturesPrice] = useState('');
  const [futuresLots, setFuturesLots] = useState('');
  const [availableFunds, setAvailableFunds] = useState('');
  const [futuresDirection, setFuturesDirection] = useState<FuturesDirection>('long');
  const [maintenanceMargin, setMaintenanceMargin] = useState(0.08);
  const [futuresResult, setFuturesResult] = useState<FuturesResult | null>(null);

  // 计算股票基础盈亏
  const calculateStock = () => {
    const buy = parseFloat(stockBuyPrice);
    const sell = parseFloat(stockSellPrice);
    const qty = parseInt(stockQuantity);
    if (!buy || !sell || !qty) return;

    const commissionRate = 0.0003;
    const stampDutyRate = 0.001;
    const transferFeeRate = 0.00001;

    const buyAmount = buy * qty;
    const sellAmount = sell * qty;
    const buyCommission = Math.max(buyAmount * commissionRate, 5);
    const sellCommission = Math.max(sellAmount * commissionRate, 5);
    const stampDuty = sellAmount * stampDutyRate;
    const transferFee = (buyAmount + sellAmount) * transferFeeRate;

    const buyCost = buyCommission + transferFee / 2;
    const sellCost = sellCommission + stampDuty + transferFee / 2;
    const totalCost = buyCost + sellCost;
    const grossProfit = sellAmount - buyAmount;
    const netProfit = grossProfit - totalCost;

    setStockResult({
      profit: grossProfit,
      profitRate: (netProfit / buyAmount) * 100,
      buyCost,
      sellCost,
      totalCost,
      netProfit
    });
  };

  // 计算做T
  const calculateT = () => {
    const origCost = parseFloat(originalCost);
    const origQty = parseInt(originalQty);
    const tP = parseFloat(tPrice);
    const tQ = parseInt(tQty);
    const sellP = parseFloat(tSellPrice);
    if (!origCost || !origQty || !tP || !tQ) return;

    let realizedProfit = 0;
    let newTotalCost = origCost * origQty;
    let newTotalQty = origQty;

    if (tDirection === 'buy_first') {
      if (sellP) {
        realizedProfit = (sellP - tP) * tQ;
        newTotalCost = (origCost * origQty) + (tP * tQ) - (sellP * tQ);
      } else {
        newTotalCost = (origCost * origQty) + (tP * tQ);
        newTotalQty = origQty + tQ;
      }
    } else {
      if (sellP) {
        realizedProfit = (sellP - tP) * tQ;
        newTotalCost = (origCost * origQty) - (sellP * tQ) + (tP * tQ);
      } else {
        newTotalCost = (origCost * origQty) - (origCost * tQ);
        newTotalQty = origQty - tQ;
      }
    }

    setTResult({
      originalCost: origCost,
      newCost: newTotalQty > 0 ? newTotalCost / newTotalQty : 0,
      costReduction: origCost - (newTotalQty > 0 ? newTotalCost / newTotalQty : 0),
      realizedProfit,
      totalQuantity: newTotalQty
    });
  };

  // 计算期货
  const calculateFutures = () => {
    const price = parseFloat(futuresPrice);
    const lots = parseInt(futuresLots) || 1;
    const funds = parseFloat(availableFunds);
    if (!price) return;

    const { multiplier, marginRate, minPriceUnit } = selectedContract;
    const margin = price * multiplier * lots * marginRate;
    const maxLots = funds ? Math.floor(funds / (price * multiplier * marginRate)) : 0;
    
    let liquidationPrice = 0;
    if (funds) {
      const maintMargin = price * multiplier * lots * maintenanceMargin;
      const buffer = funds - maintMargin;
      if (futuresDirection === 'long') {
        liquidationPrice = price - (buffer / (lots * multiplier));
      } else {
        liquidationPrice = price + (buffer / (lots * multiplier));
      }
    }

    const utilization = funds ? (margin / funds) * 100 : 0;
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    if (utilization > 80) riskLevel = 'extreme';
    else if (utilization > 50) riskLevel = 'high';
    else if (utilization > 30) riskLevel = 'medium';

    setFuturesResult({
      margin,
      maxLots,
      liquidationPrice: liquidationPrice > 0 ? liquidationPrice : 0,
      pricePerTick: minPriceUnit * multiplier,
      riskLevel
    });
  };

  // 自动计算
  useEffect(() => {
    if (mode === 'stock' && activeTab === 'basic' && stockBuyPrice && stockSellPrice && stockQuantity) {
      calculateStock();
    }
  }, [stockBuyPrice, stockSellPrice, stockQuantity]);

  useEffect(() => {
    if (mode === 'stock' && activeTab === 't' && originalCost && originalQty && tPrice && tQty) {
      calculateT();
    }
  }, [originalCost, originalQty, tPrice, tQty, tSellPrice, tDirection]);

  useEffect(() => {
    if (mode === 'futures' && futuresPrice) {
      calculateFutures();
    }
  }, [futuresPrice, futuresLots, availableFunds, selectedContract, futuresDirection, maintenanceMargin]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Calculator className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">专业交易计算器</h1>
              <p className="text-slate-500 text-sm">v2.0 - 股票·期货全能版</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setMode('stock')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                mode === 'stock' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-600'
              }`}
            >
              <TrendingUp className="w-5 h-5" />
              股票
            </button>
            <button
              onClick={() => setMode('futures')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                mode === 'futures' ? 'bg-white text-purple-600 shadow-md' : 'text-slate-600'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              期货
            </button>
          </div>
        </div>

        {mode === 'stock' ? (
          <div className="space-y-6">
            {/* 股票内页切换 */}
            <div className="flex justify-center">
              <div className="inline-flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                <button
                  onClick={() => setActiveTab('basic')}
                  className={`px-6 py-2 rounded-lg font-medium transition-all ${
                    activeTab === 'basic' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  基础盈亏
                </button>
                <button
                  onClick={() => setActiveTab('t')}
                  className={`px-6 py-2 rounded-lg font-medium transition-all ${
                    activeTab === 't' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  做T成本
                </button>
              </div>
            </div>

            {activeTab === 'basic' ? (
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <DollarSign className="w-6 h-6" />
                    股票盈亏计算
                  </h2>
                  <p className="text-blue-100 text-sm mt-1">自动计算手续费、印花税、过户费</p>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">买入价格 (元)</label>
                      <input
                        type="number"
                        value={stockBuyPrice}
                        onChange={(e) => setStockBuyPrice(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                        placeholder="10.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">卖出价格 (元)</label>
                      <input
                        type="number"
                        value={stockSellPrice}
                        onChange={(e) => setStockSellPrice(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                        placeholder="11.00"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">交易数量 (股)</label>
                    <input
                      type="number"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                      placeholder="1000"
                      step="100"
                    />
                  </div>

                  {stockResult && (
                    <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                      <div className={`p-6 rounded-2xl ${stockResult.netProfit >= 0 ? 'bg-red-50 border-2 border-red-200' : 'bg-green-50 border-2 border-green-200'}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-sm text-slate-600 mb-1">净盈亏</div>
                            <div className={`text-4xl font-bold ${stockResult.netProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {stockResult.netProfit >= 0 ? '+' : ''}{stockResult.netProfit.toFixed(2)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-slate-600 mb-1">收益率</div>
                            <div className={`text-2xl font-bold ${stockResult.profitRate >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {stockResult.profitRate >= 0 ? '+' : ''}{stockResult.profitRate.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="bg-slate-50 p-4 rounded-xl text-center">
                          <div className="text-slate-500 mb-1">买入成本</div>
                          <div className="font-bold text-slate-700">{stockResult.buyCost.toFixed(2)}</div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl text-center">
                          <div className="text-slate-500 mb-1">卖出成本</div>
                          <div className="font-bold text-slate-700">{stockResult.sellCost.toFixed(2)}</div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl text-center">
                          <div className="text-slate-500 mb-1">总费用</div>
                          <div className="font-bold text-slate-700">{stockResult.totalCost.toFixed(2)}</div>
                        </div>
                      </div>
                      
                      <div className="text-xs text-slate-400 text-center">
                        佣金: 万3(最低5元) | 印花税: 千1(卖出) | 过户费: 万0.1
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Activity className="w-6 h-6" />
                    做T成本计算器
                  </h2>
                  <p className="text-indigo-100 text-sm mt-1">支持先买后卖、先卖后买两种模式</p>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      onClick={() => setTDirection('buy_first')}
                      className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                        tDirection === 'buy_first' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      先买后卖
                    </button>
                    <button
                      onClick={() => setTDirection('sell_first')}
                      className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                        tDirection === 'sell_first' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      先卖后买
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">原持仓成本 (元)</label>
                      <input
                        type="number"
                        value={originalCost}
                        onChange={(e) => setOriginalCost(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        placeholder="10.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">原持仓数量 (股)</label>
                      <input
                        type="number"
                        value={originalQty}
                        onChange={(e) => setOriginalQty(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        placeholder="1000"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-200 my-4" />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        {tDirection === 'buy_first' ? '买入价格' : '卖出价格'} (元)
                      </label>
                      <input
                        type="number"
                        value={tPrice}
                        onChange={(e) => setTPrice(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        placeholder="9.80"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">做T数量 (股)</label>
                      <input
                        type="number"
                        value={tQty}
                        onChange={(e) => setTQty(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        placeholder="500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      {tDirection === 'buy_first' ? '卖出价格' : '买入价格'} (元) [可选]
                    </label>
                    <input
                      type="number"
                      value={tSellPrice}
                      onChange={(e) => setTSellPrice(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      placeholder="完成做T的对应价格"
                    />
                  </div>

                  {tResult && (
                    <div className="mt-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                          <div className="text-xs text-slate-500 mb-1">原成本价</div>
                          <div className="text-xl font-bold text-slate-700">{tResult.originalCost.toFixed(3)}</div>
                        </div>
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 text-center">
                          <div className="text-xs text-indigo-600 mb-1">新成本价</div>
                          <div className="text-xl font-bold text-indigo-700">{tResult.newCost.toFixed(3)}</div>
                        </div>
                      </div>

                      <div className={`p-5 rounded-2xl border-2 ${tResult.costReduction > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-sm text-slate-600 mb-1">成本降低</div>
                            <div className={`text-3xl font-bold ${tResult.costReduction > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {tResult.costReduction > 0 ? '↓' : '↑'} {Math.abs(tResult.costReduction).toFixed(3)} 元
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-slate-600 mb-1">实现盈亏</div>
                            <div className={`text-xl font-semibold ${tResult.realizedProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {tResult.realizedProfit >= 0 ? '+' : ''}{tResult.realizedProfit.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 flex items-center gap-2 text-sm text-blue-800">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <span>当前持仓: {tResult.totalQuantity}股 | {tDirection === 'buy_first' ? '先买后卖' : '先卖后买'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 左侧：输入区 */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-6 text-white">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <BarChart3 className="w-6 h-6" />
                      期货计算器
                    </h2>
                  </div>

                  <div className="p-6 space-y-5">
                    {/* 合约选择 */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">选择合约</label>
                      <div className="relative">
                        <select
                          value={selectedContract.code}
                          onChange={(e) => setSelectedContract(FUTURES_CONTRACTS.find(c => c.code === e.target.value) || FUTURES_CONTRACTS[0])}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none appearance-none bg-white"
                        >
                          {FUTURES_CONTRACTS.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} - {c.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                      </div>
                      <div className="flex gap-3 text-xs text-slate-500">
                        <span>乘数: {selectedContract.multiplier}</span>
                        <span>保证金: {(selectedContract.marginRate * 100).toFixed(0)}%</span>
                        <span>最小变动: {selectedContract.minPriceUnit}</span>
                      </div>
                    </div>

                    {/* 方向选择 */}
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                      <button
                        onClick={() => setFuturesDirection('long')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                          futuresDirection === 'long' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        <TrendingUp className="w-4 h-4" />
                        做多
                      </button>
                      <button
                        onClick={() => setFuturesDirection('short')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                          futuresDirection === 'short' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        <TrendingDown className="w-4 h-4" />
                        做空
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">开仓价格</label>
                        <input
                          type="number"
                          value={futuresPrice}
                          onChange={(e) => setFuturesPrice(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none"
                          placeholder="3500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">开仓手数</label>
                        <input
                          type="number"
                          value={futuresLots}
                          onChange={(e) => setFuturesLots(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none"
                          placeholder="1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">可用资金 (元)</label>
                      <input
                        type="number"
                        value={availableFunds}
                        onChange={(e) => setAvailableFunds(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none"
                        placeholder="100000"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-700">维持保证金比例</span>
                        <span className="text-slate-500">{(maintenanceMargin * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.15"
                        step="0.01"
                        value={maintenanceMargin}
                        onChange={(e) => setMaintenanceMargin(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                      />
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>5%</span>
                        <span>15%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 强平风险提示 */}
                {futuresResult && futuresResult.liquidationPrice > 0 && (
                  <div className={`rounded-2xl border-l-4 p-6 ${
                    futuresResult.riskLevel === 'extreme' ? 'bg-red-50 border-red-600' :
                    futuresResult.riskLevel === 'high' ? 'bg-orange-50 border-orange-500' :
                    futuresResult.riskLevel === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                    'bg-green-50 border-green-500'
                  }`}>
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-full ${
                        futuresResult.riskLevel === 'extreme' ? 'bg-red-100 text-red-600' :
                        futuresResult.riskLevel === 'high' ? 'bg-orange-100 text-orange-600' :
                        futuresResult.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        <ShieldAlert className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-lg">强平风险提示</h3>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            futuresResult.riskLevel === 'extreme' ? 'bg-red-600 text-white' :
                            futuresResult.riskLevel === 'high' ? 'bg-orange-500 text-white' :
                            futuresResult.riskLevel === 'medium' ? 'bg-yellow-500 text-white' :
                            'bg-green-500 text-white'
                          }`}>
                            {futuresResult.riskLevel === 'extreme' ? '极高风险' :
                             futuresResult.riskLevel === 'high' ? '高风险' :
                             futuresResult.riskLevel === 'medium' ? '中等风险' : '低风险'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-3">
                          <div>
                            <div className="text-sm text-slate-600 mb-1">预估强平价格</div>
                            <div className={`text-2xl font-bold ${futuresDirection === 'long' ? 'text-green-600' : 'text-red-600'}`}>
                              {futuresResult.liquidationPrice.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-600 mb-1">价格安全空间</div>
                            <div className="text-2xl font-bold text-slate-700">
                              {futuresDirection === 'long' 
                                ? ((parseFloat(futuresPrice) - futuresResult.liquidationPrice) / parseFloat(futuresPrice) * 100).toFixed(2)
                                : ((futuresResult.liquidationPrice - parseFloat(futuresPrice)) / parseFloat(futuresPrice) * 100).toFixed(2)
                              }%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 右侧：数据面板 */}
              <div className="space-y-6">
                {/* 保证金信息 */}
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-purple-600" />
                    资金计算
                  </h3>
                  {futuresResult ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-purple-50 rounded-xl">
                        <span className="text-sm text-slate-600">占用保证金</span>
                        <span className="font-bold text-purple-700">{futuresResult.margin.toLocaleString()} 元</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                        <span className="text-sm text-slate-600">最大可开手数</span>
                        <span className="font-bold text-slate-800">{futuresResult.maxLots} 手</span>
                      </div>
                      {availableFunds && (
                        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                          <span className="text-sm text-slate-600">资金利用率</span>
                          <span className="font-bold text-blue-700">
                            {((futuresResult.margin / parseFloat(availableFunds)) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-8 text-sm">输入价格后自动计算</div>
                  )}
                </div>

                {/* 波动盈亏 */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-lg p-6 text-white">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    波动盈亏
                  </h3>
                  <div className="text-center mb-4">
                    <div className="text-4xl font-bold text-yellow-400">
                      ±{futuresResult?.pricePerTick || selectedContract.multiplier * selectedContract.minPriceUnit} 元
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      每波动 {selectedContract.minPriceUnit} 个点
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-800 p-3 rounded-xl">
                      <div className="text-xs text-slate-400 mb-1">涨停盈利</div>
                      <div className="text-lg font-semibold text-red-400">
                        +{futuresPrice ? (parseFloat(futuresPrice) * 0.1 * selectedContract.multiplier * (parseInt(futuresLots) || 1)).toFixed(0) : '0'}
                      </div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-xl">
                      <div className="text-xs text-slate-400 mb-1">跌停亏损</div>
                      <div className="text-lg font-semibold text-green-400">
                        -{futuresPrice ? (parseFloat(futuresPrice) * 0.1 * selectedContract.multiplier * (parseInt(futuresLots) || 1)).toFixed(0) : '0'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 合约信息 */}
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-800 mb-4">合约参数</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">交易所</span>
                      <span className="font-medium">{selectedContract.exchange}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">合约乘数</span>
                      <span className="font-medium">{selectedContract.multiplier} 元/点</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">保证金比例</span>
                      <span className="font-medium">{(selectedContract.marginRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 底部说明 */}
        <div className="text-center text-slate-400 text-xs pb-8">
          <p>交易计算器仅供参考，实际交易请以交易所和券商结算为准</p>
          <p className="mt-1">期货交易风险极高，请谨慎操作</p>
        </div>
      </div>
    </div>
  );
}
