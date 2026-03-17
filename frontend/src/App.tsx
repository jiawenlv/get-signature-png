import { useState } from "react";
import StampPanel from "./components/StampPanel";
import EnhancePanel from "./components/EnhancePanel";

type Tab = "enhance" | "extract";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("enhance");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">
            小吕的图像工作室
          </h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("enhance")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === "enhance"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              图像去模糊
            </button>
            <button
              onClick={() => setActiveTab("extract")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === "extract"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              印章提取
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div style={{ display: activeTab === "enhance" ? "block" : "none" }}>
          <EnhancePanel />
        </div>
        <div style={{ display: activeTab === "extract" ? "block" : "none" }}>
          <StampPanel />
        </div>
      </main>
    </div>
  );
}

export default App;
