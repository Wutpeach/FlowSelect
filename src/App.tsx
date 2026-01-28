import Sidebar from "./components/Sidebar";
import MaterialGrid from "./components/MaterialGrid";

function App() {
  return (
    <div className="w-screen h-screen bg-[#2a2a2a] rounded-2xl border border-[#3a3a3a] flex flex-col overflow-hidden">
      {/* 顶部标题栏 */}
      <header
        data-tauri-drag-region
        className="h-10 bg-[#1e1e1e] border-b border-[#3a3a3a] flex items-center px-4 shrink-0"
      >
        <span className="text-sm text-[#a0a0a0]">FlowSelect</span>
      </header>

      {/* 主内容区 */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <MaterialGrid />
      </div>
    </div>
  );
}

export default App;
