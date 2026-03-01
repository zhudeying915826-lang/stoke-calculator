import { useState } from 'react'
import { Calculator, TrendingUp, TrendingDown, RefreshCcw } from 'lucide-react'

function App() {
  const [buyPrice, setBuyPrice] = useState<string>('')
  const [sellPrice, setSellPrice] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('')
  const [result, setResult] = useState<{
    profit: number;
    profitRate: number;
    buyCost: number;
    sellCost: number;
    totalCost: number;
  } | null>(null)

  const calculate = () => {
    const buy = parseFloat(buyPrice)
    const sell = parseFloat(sellPrice)
    const qty = parseInt(quantity)

    if (!buy || !sell || !qty) return

    // 假设佣金万分之3，最低5元；印花税千分之1（卖出时）；过户费万分之0.1
    const commissionRate = 0.0003
    const stampDutyRate = 0.001
    const transferFeeRate = 0.00001

    const buyAmount = buy * qty
    const sellAmount = sell * qty
    
    const buyCommission = Math.max(buyAmount * commissionRate, 5)
    const sellCommission = Math.max(sellAmount * commissionRate, 5)
    const stampDuty = sellAmount * stampDutyRate
    const transferFee = (buyAmount + sellAmount) * transferFeeRate

    const buyCost = buyCommission + transferFee / 2
    const sellCost = sellCommission + stampDuty + transferFee / 2
    const totalCost = buyCost + sellCost
    
    const profit = sellAmount - buyAmount - totalCost
    const profitRate = (profit / buyAmount) * 100

    setResult({
      profit,
      profitRate,
      buyCost,
      sellCost,
      totalCost
    })
  }

  const reset = () => {
    setBuyPrice('')
    setSellPrice('')
    setQuantity('')
    setResult(null)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
        {/* 标题 */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-2">
            <Calculator className="w-10 h-10 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">股票盈亏计算器</h1>
          <p className="text-gray-500 text-sm mt-1">计算交易成本与盈亏</p>
        </div>

        {/* 输入区域 */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">买入价格 (元)</label>
            <input
              type="number"
              step="0.01"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="请输入买入价格"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">卖出价格 (元)</label>
            <input
              type="number"
              step="0.01"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="请输入卖出价格"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">股票数量 (股)</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="请输入数量（如1000）"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={calculate}
            className="flex-1 bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition flex items-center justify-center gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            计算盈亏
          </button>
          <button
            onClick={reset}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            重置
          </button>
        </div>

        {/* 结果显示 */}
        {result && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <span className="text-gray-600">盈亏金额:</span>
              <span className={`text-xl font-bold ${result.profit >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {result.profit >= 0 ? '+' : ''}{result.profit.toFixed(2)} 元
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600">收益率:</span>
              <span className={`font-bold ${result.profitRate >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {result.profitRate >= 0 ? '+' : ''}{result.profitRate.toFixed(2)}%
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">买入成本:</span>
              <span className="text-gray-700">{result.buyCost.toFixed(2)} 元</span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">卖出成本:</span>
              <span className="text-gray-700">{result.sellCost.toFixed(2)} 元</span>
            </div>
            
            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200">
              <span className="text-gray-500">总手续费:</span>
              <span className="text-gray-700">{result.totalCost.toFixed(2)} 元</span>
            </div>
          </div>
        )}

        {/* 说明 */}
        <div className="mt-6 text-xs text-gray-400 text-center">
          <p>佣金: 万分之3（最低5元）| 印花税: 千分之1</p>
          <p className="mt-1">v1.1.0 - Stock Calculator</p>
        </div>
      </div>
    </div>
  )
}

export default App
