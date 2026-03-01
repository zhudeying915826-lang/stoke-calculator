import { useState, useMemo } from 'react';
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
  Target
} from 'lucide-react';

// 交易模式
type TradeMode = 'stock' | 'futures';
type TDirection = 'buy_first' | 'sell_first';
type FuturesDirection = 'long' | 'short';

// 默认期货合约配置
const DEFAULT_FUTURES_CONTRACTS = [
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
  { code: 'SC', name: '原油', multiplier: 1000, marginRate: 0.10, minPriceUnit: 0.1, exchange: 'INE' },
];

// 费率设置类型
interface FeeSettings {
  commissionRate: number;
  minCommission: number;
  stampDutyRate: number;
  transferFeeRate: number;
}

// 期货合约类型
interface FuturesContract {
  code: string;
  name: string;
  multiplier: number;
  marginRate: number;
  minPriceUnit: number;
  exchange: string;
}

export default function App() {
  const [mode, setMode] = useState<TradeMode>('stock');
  const [activeTab, setActiveTab] = useState<'basic' | 't'>('basic');

  const [feeSettings, setFeeSettings] = useState<FeeSettings>({
    commissionRate: 3,
    minCommission: 5,
    stampDutyRate: 10,
    transferFeeRate: 0.1
  });

  const [stockBuyPrice, setStockBuyPrice] = useState<string>('');
  const [stockBuyQty, setStockBuyQty] = useState<string>('100');
  const [stockSellPrice, setStockSellPrice] = useState<string>('');
  const [stockSellQty, setStockSellQty] = useState<string>('100');

  const [tDirection, setTDirection] = useState<TDirection>('buy_first');
  const [originalCost, setOriginalCost] = useState('');
  const [originalQty, setOriginalQty] = useState('');
  const [tPrice, setTPrice] = useState('');
  const [tQty, setTQty] = useState('');
  const [tSellPrice, setTSellPrice] = useState('');

  const [futuresContracts, setFuturesContracts] = useState<FuturesContract[]>(DEFAULT_FUTURES_CONTRACTS);
  const [selectedContractCode, setSelectedContractCode] = useState('IF');
  const [futuresPrice, setFuturesPrice] = useState('');
  const [futuresLots, setFuturesLots] = useState('1');
  const [availableFunds, setAvailableFunds] = useState('');
  const [futuresDirection, setFuturesDirection] = useState<FuturesDirection>('long');
  const [showContractEditor, setShowContractEditor] = useState(false);

  const selectedContract = useMemo(() => 
    futuresContracts.find(c => c.code === selectedContractCode) || futuresContracts[0],
    [futuresContracts, selectedContractCode]
  );

  const stockCalculation = useMemo(() => {
    const buyPrice = parseFloat(stockBuyPrice) || 0;
    const buyQty = parseInt(stockBuyQty) || 0;
    const sellPrice = parseFloat(stockSellPrice) || 0;
    const sellQty = parseInt(stockSellQty) || 0;

    if (!buyPrice || !buyQty) return null;

    const buyAmount = buyPrice * buyQty;
    const buyCommission = Math.max(buyAmount * (feeSettings.commissionRate / 10000), feeSettings.minCommission);
    const buyTransferFee = buyAmount * (feeSettings.transferFeeRate / 10000);
    const buyTotalCost = buyCommission + buyTransferFee;
    const buyNetCost = buyAmount + buyTotalCost;

    const sellCommissionRate = feeSettings.commissionRate / 10000;
    const stampDutyRate = feeSettings.stampDutyRate / 10000;
    const transferRate = feeSettings.transferFeeRate / 10000;
    
    const denominator = 1 - sellCommissionRate - stampDutyRate - transferRate;
    let breakEvenPrice = 0;
    if (denominator > 0) {
      breakEvenPrice = (buyNetCost + feeSettings.minCommission) / (buyQty * denominator);
    }

    let sellCalculation = null;
    if (sellPrice && sellQty) {
      const sellAmount = sellPrice * sellQty;
      const sellCommission = Math.max(sellAmount * sellCommissionRate, feeSettings.minCommission);
      const sellStampDuty = sellAmount * stampDutyRate;
      const sellTransferFee = sellAmount * transferRate;
      const sellTotalCost = sellCommission + sellStampDuty + sellTransferFee;
      const sellNetIncome = sellAmount - sellTotalCost;

      const grossProfit = sellAmount - buyAmount;
      const totalFee = buyTotalCost + sellTotalCost;
      const netProfit = sellNetIncome - buyNetCost;
      const profitRate = buyNetCost > 0 ? (netProfit / buyNetCost) * 100 : 0;

      sellCalculation = {
        sellAmount,
        sellCommission,
        sellStampDuty,
        sellTransferFee,
        sellTotalCost,
        sellNetIncome,
        grossProfit,
        totalFee,
        netProfit,
        profitRate
      };
    }

    return {
      buyAmount,
      buyCommission,
      buyTransferFee,
      buyTotalCost,
      buyNetCost,
      breakEvenPrice,
      sellCalculation
    };
  }, [stockBuyPrice, stockBuyQty, stockSellPrice, stockSellQty, feeSettings]);

  const tCalculation = useMemo(() => {
    const origCost = parseFloat(originalCost);
    const origQty = parseInt(originalQty);
    const tP = parseFloat(tPrice);
    const tQ = parseInt(tQty);
    const sellP = parseFloat(tSellPrice);
    
    if (!origCost || !origQty || !tP || !tQ) return null;

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

    return {
      originalCost: origCost,
      newCost: newTotalQty > 0 ? newTotalCost / newTotalQty : 0,
      costReduction: origCost - (newTotalQty > 0 ? newTotalCost / newTotalQty : 0),
      realizedProfit,
      totalQuantity: newTotalQty
    };
  }, [originalCost, originalQty, tPrice, tQty, tSellPrice, tDirection]);

  const futuresCalculation = useMemo(() => {
    const price = parseFloat(futuresPrice) || 0;
    const lots = parseInt(futuresLots) || 0;
    const funds = parseFloat(availableFunds) || 0;

    if (!price) return null;

    const { multiplier, marginRate, minPriceUnit } = selectedContract;
    const margin = price * multiplier * lots * marginRate;
    const maxLots = funds ? Math.floor(funds / (price * multiplier * marginRate)) : 0;
    
    let liquidationPrice = 0;
    if (funds && lots > 0) {
      const maintMargin = price * multiplier * lots * 0.08;
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

    return {
      margin,
      maxLots,
      liquidationPrice: liquidationPrice > 0 ? liquidationPrice : 0,
      pricePerTick: minPriceUnit * multiplier,
      riskLevel,
      utilization
    };
  }, [futuresPrice, futuresLots, availableFunds, selectedContract, futuresDirection]);

  const resetFees = () => {
    setFeeSettings({
      commissionRate: 3,
      minCommission: 5,
      stampDutyRate: 10,
      transferFeeRate: 0.1
    });
  };

  const updateContract = (code: string, updates: Partial<FuturesContract>) => {
    setFuturesContracts(prev => prev.map(c => 
      c.code === code ? { ...c, ...updates } : c
    ));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Calculator className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">专业交易计算器</h1>
              <p className="text-slate-500 text-sm">股票·期货全能版</p>
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

        {mode === 'stock' ? (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="inline-flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                <button
                  onClick={() => setActiveTab('basic')}
                  className={`px-6 py-2 rounded-lg font-medium transition-all ${
                    activeTab === 'basic' ? 'bg-blue-100 text-blue-700' : 'text-slate-600'
                  }`}
                >
                  基础盈亏计算
                </button>
                <button
                  onClick={() => setActiveTab('t')}
                  className={`px-6 py-2 rounded-lg font-medium transition-all ${
                    activeTab === 't' ? 'bg-blue-100 text-blue-700' : 'text-slate-600'
                  }`}
                >
                  做T成本计算
                </button>
              </div>
            </div>

            {activeTab === 'basic' ? (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <TrendingDown className="w-5 h-5 text-green-600" />
                          买入参数
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">买入价格 (元)</label>
                            <input
                              type="number"
                              value={stockBuyPrice}
                              onChange={(e) => setStockBuyPrice(e.target.value)}
                              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                              placeholder="0.00"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">买入数量 (股)</label>
                            <input
                              type="number"
                              value={stockBuyQty}
                              onChange={(e) => setStockBuyQty(e.target.value)}
                              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                              placeholder="100"
                              step="100"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-red-600" />
                          卖出参数
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">卖出价格 (元)</label>
                            <input
                              type="number"
                              value={stockSellPrice}
                              onChange={(e) => setStockSellPrice(e.target.value)}
                              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                              placeholder="0.00"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">卖出数量 (股)</label>
                            <input
                              type="number"
                              value={stockSellQty}
                              onChange={(e) => setStockSellQty(e.target.value)}
                              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                              placeholder="100"
                              step="100"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-slate-200" />

                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Settings className="w-5 h-5 text-slate-600" />
                          费率设置
                        </h3>
                        <button 
                          onClick={resetFees}
                          className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                          重置参数
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">佣金费率 (‱)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={feeSettings.commissionRate}
                            onChange={(e) => setFeeSettings({...feeSettings, commissionRate: parseFloat(e.target.value) || 0})}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 outline-none text-sm"
                          />
                          <p className="text-xs text-slate-400">默认万分之{feeSettings.commissionRate}</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">最低佣金 (元)</label>
                          <input
                            type="number"
                            value={feeSettings.minCommission}
                            onChange={(e) => setFeeSettings({...feeSettings, minCommission: parseFloat(e.target.value) || 0})}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 outline-none text-sm"
                          />
                          <p className="text-xs text-slate-400">默认{feeSettings.minCommission}元</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">印花税率 (‱)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={feeSettings.stampDutyRate}
                            onChange={(e) => setFeeSettings({...feeSettings, stampDutyRate: parseFloat(e.target.value) || 0})}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 outline-none text-sm"
                          />
                          <p className="text-xs text-slate-400">卖出时收取，默认万分之{feeSettings.stampDutyRate}</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">过户费率 (‱)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={feeSettings.transferFeeRate}
                            onChange={(e) => setFeeSettings({...feeSettings, transferFeeRate: parseFloat(e.target.value) || 0})}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 outline-none text-sm"
                          />
                          <p className="text-xs text-slate-400">默认万分之{feeSettings.transferFeeRate}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {stockCalculation && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="bg-green-50 p-4 border-b border-green-100">
                        <h3 className="font-bold text-green-800 flex items-center gap-2">
                          <TrendingDown className="w-5 h-5" />
                          买入成本明细
                        </h3>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">买入金额</span>
                          <span className="font-medium">¥{stockCalculation.buyAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">买入佣金</span>
                          <span className="font-medium text-red-600">-¥{stockCalculation.buyCommission.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">过户费</span>
                          <span className="font-medium text-red-600">-¥{stockCalculation.buyTransferFee.toFixed(2)}</span>
                        </div>
                        <div className="h-px bg-slate-200 my-2" />
                        <div className="flex justify-between font-bold text-green-700">
                          <span>买入总成本</span>
                          <span>¥{stockCalculation.buyNetCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="bg-red-50 p-4 border-b border-red-100">
                        <h3 className="font-bold text-red-800 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5" />
                          卖出收入明细
                        </h3>
                      </div>
                      <div className="p-4 space-y-3">
                        {stockCalculation.sellCalculation ? (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">卖出金额</span>
                              <span className="font-medium">¥{stockCalculation.sellCalculation.sellAmount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">卖出佣金</span>
                              <span className="font-medium text-red-600">-¥{stockCalculation.sellCalculation.sellCommission.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">印花税</span>
                              <span className="font-medium text-red-600">-¥{stockCalculation.sellCalculation.sellStampDuty.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">过户费</span>
                              <span className="font-medium text-red-600">-¥{stockCalculation.sellCalculation.sellTransferFee.toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-slate-200 my-2" />
                            <div className="flex justify-between font-bold text-red-700">
                              <span>卖出净收入</span>
                              <span>¥{stockCalculation.sellCalculation.sellNetIncome.toFixed(2)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center text-slate-400 py-8 text-sm">
                            输入卖出价格查看明细
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border-2 border-red-200 overflow-hidden">
                      <div className="bg-red-100 p-4 border-b border-red-200">
                        <h3 className="font-bold text-red-800">盈亏分析</h3>
                      </div>
                      <div className="p-4 space-y-3">
                        {stockCalculation.sellCalculation ? (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">毛盈亏</span>
                              <span className={`font-medium ${stockCalculation.sellCalculation.grossProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {stockCalculation.sellCalculation.grossProfit >= 0 ? '+' : ''}¥{stockCalculation.sellCalculation.grossProfit.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">总交易费用</span>
                              <span className="font-medium text-green-600">-¥{stockCalculation.sellCalculation.totalFee.toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-slate-200 my-2" />
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-800">净利润</span>
                              <span className={`text-2xl font-bold ${stockCalculation.sellCalculation.netProfit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {stockCalculation.sellCalculation.netProfit >= 0 ? '+' : ''}¥{stockCalculation.sellCalculation.netProfit.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm mt-2">
                              <span className="text-slate-600">收益率</span>
                              <span className={`font-bold ${stockCalculation.sellCalculation.profitRate >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {stockCalculation.sellCalculation.profitRate >= 0 ? '+' : ''}{stockCalculation.sellCalculation.profitRate.toFixed(2)}%
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex justify-between text-sm text-slate-400">
                              <span>毛盈亏</span>
                              <span>+¥0.00</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-400">
                              <span>总交易费用</span>
                              <span>-¥0.00</span>
                            </div>
                            <div className="h-px bg-slate-200 my-2" />
                            <div className="text-center text-slate-400 py-2">
                              输入卖出价格查看盈亏
                            </div>
                          </div>
                        )}
                        
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Target className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-800">保本价提示</span>
                          </div>
                          <div className="text-2xl font-bold text-blue-700">
                            ¥{stockCalculation.breakEvenPrice.toFixed(2)}
                          </div>
                          <p className="text-xs text-blue-600 mt-1">
                            卖出价格 ≥ 此价格可盈利（考虑所有费用）
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Activity className="w-6 h-6" />
                    做T成本计算器
                  </h2>
                </div>

                <div className="p-6 space-y-6">
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                    <button
                      onClick={() => setTDirection('buy_first')}
                      className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                        tDirection === 'buy_first' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      <TrendingDown className="w-4 h-4" />
                      先买后卖
                    </button>
                    <button
                      onClick={() => setTDirection('sell_first')}
                      className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                        tDirection === 'sell_first' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4" />
                      先卖后买
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="font-bold text-slate-800">原持仓</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm text-slate-600">原持仓成本 (元)</label>
                          <input
                            type="number"
                            value={originalCost}
                            onChange={(e) => setOriginalCost(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
                            placeholder="10.00"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-slate-600">原持仓数量 (股)</label>
                          <input
                            type="number"
                            value={originalQty}
                            onChange={(e) => setOriginalQty(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
                            placeholder="1000"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-bold text-slate-800">做T操作</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm text-slate-600">
                            {tDirection === 'buy_first' ? '买入价格' : '卖出价格'} (元)
                          </label>
                          <input
                            type="number"
                            value={tPrice}
                            onChange={(e) => setTPrice(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
                            placeholder="9.80"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-slate-600">做T数量 (股)</label>
                          <input
                            type="number"
                            value={tQty}
                            onChange={(e) => setTQty(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
                            placeholder="500"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-slate-600">
                          {tDirection === 'buy_first' ? '卖出价格' : '买入价格'} (元) [可选]
                        </label>
                        <input
                          type="number"
                          value={tSellPrice}
                          onChange={(e) => setTSellPrice(e.target.value)}
                          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
                          placeholder="完成做T的对应价格"
                        />
                      </div>
                    </div>
                  </div>

                  {tCalculation && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                      <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-200">
                        <div className="text-sm text-slate-500 mb-1">原成本价</div>
                        <div className="text-xl font-bold text-slate-700">¥{tCalculation.originalCost.toFixed(3)}</div>
                      </div>
                      <div className="bg-indigo-50 p-4 rounded-xl text-center border border-indigo-200">
                        <div className="text-sm text-indigo-600 mb-1">新成本价</div>
                        <div className="text-xl font-bold text-indigo-700">¥{tCalculation.newCost.toFixed(3)}</div>
                      </div>
                      <div className={`p-4 rounded-xl text-center border-2 ${tCalculation.costReduction > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="text-sm text-slate-600 mb-1">成本降低</div>
                        <div className={`text-xl font-bold ${tCalculation.costReduction > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {tCalculation.costReduction > 0 ? '↓' : '↑'} ¥{Math.abs(tCalculation.costReduction).toFixed(3)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                    合约选择
                  </h3>
                  <button
                    onClick={() => setShowContractEditor(!showContractEditor)}
                    className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    <Settings className="w-4 h-4" />
                    {showContractEditor ? '收起参数' : '自定义参数'}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1 space-y-4">
                    <div className="relative">
                      <select
                        value={selectedContractCode}
                        onChange={(e) => setSelectedContractCode(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-purple-500 outline-none appearance-none bg-white"
                      >
                        {futuresContracts.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} - {c.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                    </div>
                    
                    <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm">
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
                      <div className="flex justify-between">
                        <span className="text-slate-500">最小变动</span>
                        <span className="font-medium">{selectedContract.minPriceUnit}</span>
                      </div>
                    </div>
                  </div>

                  {showContractEditor && (
                    <div className="lg:col-span-2 bg-purple-50 p-4 rounded-lg border border-purple-200 space-y-4">
                      <h4 className="font-bold text-purple-800">合约参数编辑</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs text-purple-700">合约乘数</label>
                          <input
                            type="number"
                            value={selectedContract.multiplier}
                            onChange={(e) => updateContract(selectedContract.code, { multiplier: parseInt(e.target.value) || 1 })}
                            className="w-full px-3 py-2 rounded border border-purple-200 focus:border-purple-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-purple-700">保证金比例 (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={(selectedContract.marginRate * 100).toFixed(1)}
                            onChange={(e) => updateContract(selectedContract.code, { marginRate: parseFloat(e.target.value) / 100 || 0 })}
                            className="w-full px-3 py-2 rounded border border-purple-200 focus:border-purple-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-purple-700">最小变动价位</label>
                          <input
                            type="number"
                            step="0.1"
                            value={selectedContract.minPriceUnit}
                            onChange={(e) => updateContract(selectedContract.code, { minPriceUnit: parseFloat(e.target.value) || 0.1 })}
                            className="w-full px-3 py-2 rounded border border-purple-200 focus:border-purple-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-purple-700">交易所</label>
                          <input
                            type="text"
                            value={selectedContract.exchange}
                            onChange={(e) => updateContract(selectedContract.code, { exchange: e.target.value })}
                            className="w-full px-3 py-2 rounded border border-purple-200 focus:border-purple-500 outline-none text-sm"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-purple-600">
                        * 修改仅影响当前选中合约，刷新页面后恢复默认
                      </p>
                    </div>
                  )}
                </div>

                <div className="h-px bg-slate-200" />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
                      <button
                        onClick={() => setFuturesDirection('long')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                          futuresDirection === 'long' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        <TrendingUp className="w-4 h-4" />
                        做多
                      </button>
                      <button
                        onClick={() => setFuturesDirection('short')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
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
                          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-purple-500 outline-none"
                          placeholder="3500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">开仓手数</label>
                        <input
                          type="number"
                          value={futuresLots}
                          onChange={(e) => setFuturesLots(e.target.value)}
                          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-purple-500 outline-none"
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
                        className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-purple-500 outline-none"
                        placeholder="100000"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {futuresCalculation ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                            <div className="text-sm text-purple-600 mb-1">占用保证金</div>
                            <div className="text-xl font-bold text-purple-700">¥{futuresCalculation.margin.toLocaleString()}</div>
                          </div>
                          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <div className="text-sm text-blue-600 mb-1">最大可开手数</div>
                            <div className="text-xl font-bold text-blue-700">{futuresCalculation.maxLots} 手</div>
                          </div>
                        </div>

                        {futuresCalculation.liquidationPrice > 0 && (
                          <div className={`p-4 rounded-lg border-l-4 ${
                            futuresCalculation.riskLevel === 'extreme' ? 'bg-red-50 border-red-500' :
                            futuresCalculation.riskLevel === 'high' ? 'bg-orange-50 border-orange-500' :
                            'bg-green-50 border-green-500'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <ShieldAlert className="w-5 h-5 text-slate-700" />
                              <span className="font-bold text-slate-800">强平风险提示</span>
                            </div>
                            <div className="text-2xl font-bold text-slate-700">
                              {futuresCalculation.liquidationPrice.toFixed(2)}
                            </div>
                            <p className="text-sm text-slate-600 mt-1">
                              {futuresDirection === 'long' ? '跌破' : '涨破'}此价格将触发强平
                            </p>
                          </div>
                        )}

                        <div className="bg-slate-800 text-white p-4 rounded-lg">
                          <div className="text-sm text-slate-400 mb-1">每跳盈亏 (¥)</div>
                          <div className="text-2xl font-bold text-yellow-400">
                            ±{futuresCalculation.pricePerTick}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            每波动 {selectedContract.minPriceUnit} 个点
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-400">
                        输入开仓价格查看计算结果
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-center text-slate-400 text-xs pb-8">
          <p>交易计算器仅供参考，实际交易请以交易所和券商结算为准</p>
          <p className="mt-1">股市有风险，入市需谨慎；期货交易可能导致本金全部损失</p>
        </div>
      </div>
    </div>
  );
}
