import { useState } from 'react'
import { Calculator } from 'lucide-react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="flex items-center justify-center mb-6">
          <Calculator className="w-12 h-12 text-blue-500" />
        </div>
        <h1 className="text-2xl font-bold text-center mb-4">股票计算器</h1>
        <p className="text-gray-600 text-center mb-6">股票交易辅助工具</p>
        
        <div className="space-y-4">
          <button 
            onClick={() => setCount(count + 1)}
            className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition"
          >
            点击次数: {count}
          </button>
        </div>
        
        <p className="text-sm text-gray-400 text-center mt-6">v1.1.0</p>
      </div>
    </div>
  )
}

export default App